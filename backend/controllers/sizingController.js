import Product from '../models/Product.js';
import User from '../models/User.js';
import SizingFeedback from '../models/SizingFeedback.js';

// ── RECOMMENDATION ENGINE ──────────────────────────────────────────────────────
export const getRecommendation = async (req, res) => {
  try {
    const { productId, measurements } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID required' });
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const garmentSizes = product.garmentMeasurements || [];
    if (!garmentSizes.length) {
      return res.json({
        success: true,
        hasData: false,
        message: 'Size chart not available for this product. Please refer to the size guide or contact us.'
      });
    }

    const m           = measurements || {};
    const fitType     = product.fitType     || 'regular';
    const stretch     = product.fabricStretch || 'low';
    const shrinkPct   = product.shrinkagePercent || 0;

    const easeAllowance  = { slim: 2, regular: 4, relaxed: 7, oversized: 12 };
    const ease           = easeAllowance[fitType] || 4;
    const stretchReduce  = { none: 0, low: 0.5, medium: 1.5, high: 3 };
    const effectiveEase  = Math.max(0, ease - (stretchReduce[stretch] || 0));
    const shrinkFactor   = 1 - (shrinkPct / 100);

    const scored = garmentSizes.map(size => {
      let score = 100;
      const warnings = [];
      const notes    = [];

      // 1. CHEST — 40 points
      if (m.chest && size.chestWidth) {
        const bodyHalf    = m.chest / 2;
        const garmentHalf = size.chestWidth * shrinkFactor;
        const required    = bodyHalf + effectiveEase;
        const diff        = garmentHalf - required;

        if (diff < -2)     { score -= 40; warnings.push('Will be too tight at chest'); }
        else if (diff < 0) { score -= 20; warnings.push('Snug fit at chest'); }
        else if (diff > 8) { score -= 15; notes.push('Generous chest room'); }
        else if (diff > 4) { score -= 5;  notes.push('Comfortable chest room'); }
      }

      // 2. SHOULDER — 25 points
      if (m.shoulder && size.shoulderWidth) {
        const gs   = size.shoulderWidth * shrinkFactor;
        const diff = gs - m.shoulder;
        if (diff < -1)     { score -= 25; warnings.push('Shoulder seam will be too narrow'); }
        else if (diff < 0) { score -= 12; warnings.push('Tight at shoulders'); }
        else if (diff > 4) { score -= 8;  notes.push('Wide shoulder fit'); }
      }

      // 3. HEIGHT / GARMENT LENGTH — 20 points
      if (m.height && size.garmentLength) {
        const expectedPct = fitType === 'oversized' ? 0.45 : 0.38;
        const expectedLen = m.height * expectedPct;
        const garmentLen  = size.garmentLength * shrinkFactor;
        const diff        = garmentLen - expectedLen;

        if (diff < -5)     { score -= 20; warnings.push('Garment may appear too short'); }
        else if (diff < -2){ score -= 8;  warnings.push('Slightly short fit'); }
        else if (diff > 8) { score -= 5;  notes.push('Longer/tunic length fit'); }
      }

      // 4. WAIST — 10 points
      if (m.waist && size.waistWidth) {
        const bodyHalf    = m.waist / 2;
        const garmentHalf = size.waistWidth * shrinkFactor;
        const diff        = garmentHalf - (bodyHalf + effectiveEase * 0.7);
        if (diff < -2)     { score -= 10; warnings.push('Tight at waist'); }
        else if (diff > 6) { score -= 3; }
      }

      // 5. HEIGHT-BASED RANGE CHECK
      if (m.height) {
        const heightRanges = {
          '1Y': [74,80],  '2Y': [80,90],   '3Y': [90,98],   '4Y': [98,104],
          '5Y': [104,110],'6Y': [110,116],  '7Y': [116,122], '8Y': [122,128],
          '9Y': [128,134],'10Y': [134,140], '11Y': [140,146],'12Y': [146,152],
          '13Y':[152,158],'14Y': [158,164]
        };
        const range = heightRanges[size.size];
        if (range) {
          if (m.height < range[0] - 3)     score -= 15;
          else if (m.height < range[0])     score -= 5;
          else if (m.height > range[1] + 3) score -= 15;
          else if (m.height > range[1])     score -= 5;
          else score = Math.min(100, score + 2);
        }
      }

      return {
        size: size.size,
        score: Math.max(0, Math.round(score)),
        warnings,
        notes,
        garmentData: size
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const best   = scored[0];
    const second = scored[1];
    const third  = scored[2];

    const confidenceLabel = best.score >= 88 ? 'High' : best.score >= 70 ? 'Good' : 'Moderate';

    const fitLabels = {
      slim: 'Slim Fit', regular: 'Regular Fit',
      relaxed: 'Relaxed Fit', oversized: 'Oversized'
    };

    res.json({
      success: true,
      hasData: true,
      recommendation: {
        size:            best.size,
        confidence:      best.score,
        confidenceLabel,
        fitType:         fitLabels[fitType] || fitType,
        warnings:        best.warnings,
        notes:           best.notes,
        fitNote:         product.fitNote   || null,
        sizeUpNote:      product.sizeUpNote || null,
        alternative: second && second.score >= 55 ? {
          size:       second.size,
          confidence: second.score,
          reason: second.score >= 75
            ? `For a looser fit — ${second.score}% match`
            : null
        } : null,
        safeToAvoid: third && third.score < 40 ? {
          size:   third.size,
          reason: 'May be too tight or too short'
        } : null,
        allSizes: scored.map(s => ({
          size:        s.size,
          confidence:  s.score,
          recommended: s.size === best.size
        }))
      }
    });

  } catch (err) {
    console.error('Recommendation engine error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CHILD PROFILES ─────────────────────────────────────────────────────────────
export const getChildProfiles = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('childProfiles').lean();
    res.json({ success: true, data: user.childProfiles || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const saveChildProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if ((user.childProfiles || []).length >= 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 5 child profiles allowed per account'
      });
    }
    const profile = { ...req.body, lastMeasuredAt: new Date() };
    user.childProfiles.push(profile);
    await user.save();
    const saved = user.childProfiles[user.childProfiles.length - 1];
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateChildProfile = async (req, res) => {
  try {
    const user    = await User.findById(req.user.id);
    const profile = user.childProfiles.id(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }
    Object.assign(profile, req.body, { lastMeasuredAt: new Date() });
    await user.save();
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteChildProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.childProfiles.pull(req.params.id);
    await user.save();
    res.json({ success: true, message: 'Profile deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── FIT FEEDBACK ───────────────────────────────────────────────────────────────
export const submitFitFeedback = async (req, res) => {
  try {
    const { productId, recommendedSize, chosenSize, fitFeedback, orderId, childMeasurements } = req.body;

    const isReturn = ['too_tight', 'too_loose'].includes(fitFeedback);

    await SizingFeedback.create({
      userId: req.user.id,
      productId,
      orderId,
      recommendedSize,
      chosenSize,
      fitFeedback,
      childMeasurements,
      returnedForSize: isReturn
    });

    if (productId) {
      await Product.findByIdAndUpdate(productId, {
        $push: {
          sizingFeedback: {
            userId: req.user.id,
            recommendedSize,
            chosenSize,
            fitFeedback,
            returnedForSize: isReturn,
            createdAt: new Date()
          }
        }
      });
    }

    res.json({ success: true, message: 'Thank you for your feedback! This helps us improve.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ADMIN ANALYTICS ────────────────────────────────────────────────────────────
export const getSizingAnalytics = async (req, res) => {
  try {
    const total       = await SizingFeedback.countDocuments();
    const perfect     = await SizingFeedback.countDocuments({ fitFeedback: 'perfect' });
    const returns     = await SizingFeedback.countDocuments({ returnedForSize: true });
    const sizeMatched = await SizingFeedback.countDocuments({
      $expr: { $eq: ['$recommendedSize', '$chosenSize'] }
    });

    const productStats = await SizingFeedback.aggregate([
      { $group: {
        _id:     '$productId',
        total:   { $sum: 1 },
        returns: { $sum: { $cond: ['$returnedForSize', 1, 0] } },
        perfect: { $sum: { $cond: [{ $eq: ['$fitFeedback', 'perfect'] }, 1, 0] } }
      }},
      { $lookup: {
        from: 'products', localField: '_id', foreignField: '_id', as: 'product'
      }},
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $project: {
        productName: '$product.name',
        total: 1, returns: 1, perfect: 1,
        returnRate: { $cond: [
          { $eq: ['$total', 0] }, 0,
          { $multiply: [{ $divide: ['$returns', '$total'] }, 100] }
        ]},
        satisfactionRate: { $cond: [
          { $eq: ['$total', 0] }, 0,
          { $multiply: [{ $divide: ['$perfect', '$total'] }, 100] }
        ]}
      }},
      { $sort: { returnRate: -1 } },
      { $limit: 10 }
    ]);

    const distribution = await SizingFeedback.aggregate([
      { $group: { _id: '$fitFeedback', count: { $sum: 1 } } }
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const trend = await SizingFeedback.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: {
        _id:     { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        total:   { $sum: 1 },
        perfect: { $sum: { $cond: [{ $eq: ['$fitFeedback', 'perfect'] }, 1, 0] } }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalFeedback:    total,
          accuracyRate:     total ? Math.round((sizeMatched / total) * 100) : 0,
          satisfactionRate: total ? Math.round((perfect / total) * 100) : 0,
          returnRate:       total ? Math.round((returns  / total) * 100) : 0
        },
        productStats,
        distribution,
        trend
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getAllFeedback = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const feedback = await SizingFeedback.find()
      .populate('productId', 'name')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();
    const total = await SizingFeedback.countDocuments();
    res.json({ success: true, data: feedback, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
