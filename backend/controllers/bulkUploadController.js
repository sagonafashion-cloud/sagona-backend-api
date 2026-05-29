import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import Product from '../models/Product.js';

// ── MAIN PARSE ENDPOINT ───────────────────────────────────────
// POST /api/admin/products/bulk-parse
export const parseProductFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { originalname, buffer } = req.file;
    const ext = originalname.toLowerCase().split('.').pop();

    let products = [];
    let parseErrors = [];

    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      ({ products, parseErrors } = await parseExcel(buffer, ext));
    } else if (ext === 'docx') {
      ({ products, parseErrors } = await parseWord(buffer));
    } else if (ext === 'pdf') {
      ({ products, parseErrors } = await parsePDF(buffer));
    } else {
      return res.status(400).json({
        success: false,
        message: `Unsupported file type: .${ext}. Use .xlsx, .xls, .csv, .docx, or .pdf`
      });
    }

    if (!products.length) {
      return res.status(400).json({
        success: false,
        message: 'No valid products found in file. Check the format matches the template.',
        parseErrors
      });
    }

    const validated = products.map(p => validateProduct(p));
    const validCount = validated.filter(p => p.valid).length;

    const skus = validated.map(p => p.sku).filter(Boolean);
    const duplicateSkus = skus.filter((sku, i) => skus.indexOf(sku) !== i);

    const existingProducts = await Product.find({ sku: { $in: skus } }).select('sku name').lean();
    const existingSkuMap = {};
    existingProducts.forEach(p => { existingSkuMap[p.sku] = p.name; });

    res.json({
      success: true,
      data: {
        products: validated,
        summary: {
          total:              validated.length,
          valid:              validCount,
          invalid:            validated.length - validCount,
          willCreate:         validated.filter(p => p.valid && !existingSkuMap[p.sku]).length,
          willUpdate:         validated.filter(p => p.valid && existingSkuMap[p.sku]).length,
          duplicateSkusInFile: duplicateSkus,
          existingSkus:       Object.keys(existingSkuMap)
        },
        parseErrors
      }
    });

  } catch (err) {
    console.error('Bulk parse error:', err);
    res.status(500).json({ success: false, message: 'File parse failed: ' + err.message });
  }
};

// ── BULK CONFIRM UPLOAD ───────────────────────────────────────
// POST /api/admin/products/bulk-upload
export const bulkUploadProducts = async (req, res) => {
  try {
    const { products, mode = 'create_and_update' } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ success: false, message: 'No product data provided' });
    }

    const valid = products.filter(p => p.valid !== false);
    if (!valid.length) {
      return res.status(400).json({ success: false, message: 'No valid products to upload' });
    }

    const results = { created: [], updated: [], failed: [], skipped: [] };

    for (const product of valid) {
      try {
        const productData = buildProductData(product);
        const existing    = product.sku ? await Product.findOne({ sku: product.sku }) : null;

        if (existing) {
          if (mode === 'create_only') {
            results.skipped.push({ sku: product.sku, reason: 'Already exists (create_only mode)' });
            continue;
          }
          // Preserve images when updating
          const { images, image, ...updateData } = productData;
          await Product.findByIdAndUpdate(existing._id, { $set: updateData });
          results.updated.push({ sku: product.sku, name: product.product_name });
        } else {
          if (mode === 'update_only') {
            results.skipped.push({ sku: product.sku, reason: 'Does not exist (update_only mode)' });
            continue;
          }
          const created = await Product.create(productData);
          results.created.push({ sku: product.sku, name: product.product_name, id: created._id });
        }
      } catch (err) {
        results.failed.push({ sku: product.sku, name: product.product_name, reason: err.message });
      }
    }

    res.json({
      success: true,
      message: `Upload complete: ${results.created.length} created, ${results.updated.length} updated`,
      data: results
    });

  } catch (err) {
    console.error('Bulk upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── EXCEL / CSV PARSER ────────────────────────────────────────
async function parseExcel(buffer, ext) {
  const products    = [];
  const parseErrors = [];

  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const productSheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().includes('product')
  ) || workbook.SheetNames[0];

  const measureSheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().includes('measure') || n.toLowerCase().includes('size')
  );

  const productSheet = workbook.Sheets[productSheetName];
  const rows = XLSX.utils.sheet_to_json(productSheet, {
    header: 1, defval: '', blankrows: false
  });

  // Find header row (first row with 'product_name' or 'sku')
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const rowStr = rows[i].join('|').toLowerCase();
    if (rowStr.includes('product_name') || rowStr.includes('sku')) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rows[headerRowIdx].map(h =>
    String(h).trim().toLowerCase().replace(/\s+/g, '_')
  );

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c)) continue;

    const product = {};
    headers.forEach((header, ci) => {
      if (header) product[header] = String(row[ci] ?? '').trim();
    });

    if (product.sku?.startsWith('#')) continue;
    if (!product.sku && !product.product_name) continue;

    products.push(product);
  }

  // Parse measurements sheet
  const measurementsBySku = {};
  if (measureSheetName) {
    try {
      const measSheet = workbook.Sheets[measureSheetName];
      const measRows  = XLSX.utils.sheet_to_json(measSheet, {
        header: 1, defval: '', blankrows: false
      });

      let measHeaderIdx = 0;
      for (let i = 0; i < Math.min(measRows.length, 5); i++) {
        const rowStr = measRows[i].join('|').toLowerCase();
        if (rowStr.includes('sku') && rowStr.includes('size')) {
          measHeaderIdx = i; break;
        }
      }

      const measHeaders = measRows[measHeaderIdx].map(h =>
        String(h).trim().toLowerCase().replace(/[\s()*]+/g, '_').replace(/_+/g, '_').replace(/_$/, '')
      );

      for (let i = measHeaderIdx + 1; i < measRows.length; i++) {
        const row = measRows[i];
        if (!row || row.every(c => !c)) continue;

        const meas = {};
        measHeaders.forEach((h, ci) => { if (h) meas[h] = row[ci]; });

        const sku  = String(meas.sku  || '').trim();
        const size = String(meas.size || '').trim();
        if (!sku || !size) continue;

        if (!measurementsBySku[sku]) measurementsBySku[sku] = [];
        measurementsBySku[sku].push({
          size,
          chestWidth:    parseNum(meas.chest_cm),
          waistWidth:    parseNum(meas.waist_cm),
          hipWidth:      parseNum(meas.hip_cm),
          shoulderWidth: parseNum(meas.shoulder_cm),
          sleeveLength:  parseNum(meas.sleeve_cm),
          garmentLength: parseNum(meas.garment_length),
          inseam:        parseNum(meas.inseam_cm),
          neckWidth:     parseNum(meas.neck_cm)
        });
      }
    } catch (err) {
      parseErrors.push(`Measurements sheet parse warning: ${err.message}`);
    }
  }

  // Attach measurements to products
  products.forEach(p => {
    const meas = measurementsBySku[p.sku];
    if (meas?.length) {
      p._garmentMeasurements = meas.filter(m => m.chestWidth || m.garmentLength);
    }
  });

  return { products, parseErrors };
}

// ── WORD PARSER ───────────────────────────────────────────────
async function parseWord(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return parseTextContent(result.value);
  } catch (err) {
    return { products: [], parseErrors: [`Word parse failed: ${err.message}`] };
  }
}

// ── PDF PARSER ────────────────────────────────────────────────
async function parsePDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return parseTextContent(data.text);
  } catch (err) {
    return { products: [], parseErrors: [`PDF parse failed: ${err.message}`] };
  }
}

// ── TEXT PARSER (Word / PDF) ──────────────────────────────────
function parseTextContent(text) {
  const products    = [];
  const parseErrors = [];

  const sections = text.split(/\n[-=]{3,}\n/);

  for (const section of sections) {
    if (!section.trim()) continue;

    const product = {};
    for (const line of section.split('\n')) {
      const match = line.match(/^([^:]+?)\s*[:–\-]\s*(.+)$/);
      if (match) {
        const key   = match[1].trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const value = match[2].trim();
        if (key && value) product[key] = value;
      }
    }

    if (product.sku || product.product_name) products.push(product);
  }

  if (!products.length) {
    parseErrors.push(
      'No structured product data found. Use the Excel template for best results, or ' +
      'ensure your document uses "field: value" format with --- between products.'
    );
  }

  return { products, parseErrors };
}

// ── VALIDATION ────────────────────────────────────────────────
function validateProduct(product) {
  const errors   = [];
  const warnings = [];

  if (!product.product_name?.trim()) errors.push('Product name is required');
  if (!product.sku?.trim())          errors.push('SKU is required');
  if (!parseNum(product.price))      errors.push('Price is required and must be > 0');
  if (!product.category)             errors.push('Category is required');
  if (!product.description)          warnings.push('No description provided');

  const validCategories = ['kids', 'women', 'men', 'accessories'];
  if (product.category && !validCategories.includes(product.category.toLowerCase())) {
    errors.push(`Category must be one of: ${validCategories.join(', ')}`);
  }

  const price = parseNum(product.price);
  const mrp   = parseNum(product.mrp);
  if (mrp > 0 && mrp < price) warnings.push('MRP is less than price — will be set equal to price');

  const validGST = ['0', '5', '12', '18', '28'];
  if (product.gst_slab && !validGST.includes(String(product.gst_slab))) {
    warnings.push('GST slab should be 0, 5, 12, 18, or 28. Defaulting to 12.');
  }

  const validStatus = ['active', 'draft'];
  if (product.status && !validStatus.includes(product.status.toLowerCase())) {
    warnings.push('Status should be active or draft. Defaulting to draft.');
  }

  const validFit = ['slim', 'regular', 'relaxed', 'oversized'];
  if (product.fit_type && !validFit.includes(product.fit_type.toLowerCase())) {
    warnings.push('Fit type should be slim/regular/relaxed/oversized. Defaulting to regular.');
  }

  return {
    ...product,
    valid:     errors.length === 0,
    _errors:   errors,
    _warnings: warnings,
    _preview: {
      name:             product.product_name,
      sku:              product.sku,
      price:            parseNum(product.price),
      category:         product.category,
      sizes:            product.available_sizes,
      measurementCount: product._garmentMeasurements?.length || 0
    }
  };
}

// ── BUILD PRODUCT DATA FOR MONGODB ────────────────────────────
function buildProductData(product) {
  const price = parseNum(product.price);
  const mrp   = parseNum(product.mrp) || price;

  return {
    name:              product.product_name?.trim(),
    sku:               product.sku?.trim(),
    price,
    mrp:               Math.max(price, mrp),
    category:          (product.category || 'kids').toLowerCase(),
    ageGroup:          product.age_group || '',
    gstSlab:           parseNum(product.gst_slab) || 12,
    description:       product.description || '',
    fabric:            product.fabric_material || product.fabric || product.material || '',
    careInstructions:  product.care_instructions || '',
    variants:          buildVariants(product),
    fitType:           (product.fit_type || 'regular').toLowerCase(),
    fabricStretch:     (product.fabric_stretch || 'low').toLowerCase(),
    fabricThickness:   (product.fabric_thickness || 'medium').toLowerCase(),
    shrinkagePercent:  parseNum(product.shrinkage_percent) || 0,
    fitNote:           product.sizing_note || '',
    featured:          ['yes', 'true', '1'].includes(String(product.featured || '').toLowerCase()),
    status:            ['active', 'draft'].includes(product.status?.toLowerCase())
                         ? product.status.toLowerCase() : 'draft',
    hsnCode:           product.hsn_code || '',
    garmentMeasurements: product._garmentMeasurements || [],
    images:            [],
    image:             ''
  };
}

function buildVariants(product) {
  const variants = [];
  const sizes    = (product.available_sizes   || '').split(',').map(s => s.trim()).filter(Boolean);
  const colours  = (product.available_colours || '').split(',').map(c => c.trim()).filter(Boolean);

  for (const colour of (colours.length ? colours : [''])) {
    for (const size of sizes) {
      const suffix = [colour.replace(/\s+/g, '-').toUpperCase(), size].filter(Boolean).join('-');
      variants.push({
        colour,
        size,
        sku:   `${product.sku?.trim()}-${suffix}`.slice(0, 50),
        stock: 0
      });
    }
  }

  return variants;
}

// ── HELPERS ───────────────────────────────────────────────────
function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}
