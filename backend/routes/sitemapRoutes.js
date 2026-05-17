import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

router.get('/sitemap.xml', async (_req, res) => {
  try {
    const products = await Product.find({ status: 'active' })
      .select('_id updatedAt').lean();

    const staticPages = [
      { url: '',                priority: '1.0', changefreq: 'daily' },
      { url: 'shop.html',      priority: '0.9', changefreq: 'daily' },
      { url: 'login.html',     priority: '0.5', changefreq: 'monthly' },
      { url: 'register.html',  priority: '0.5', changefreq: 'monthly' },
      { url: 'privacy.html',   priority: '0.3', changefreq: 'monthly' },
      { url: 'support.html',   priority: '0.4', changefreq: 'monthly' },
    ];

    const productPages = products.map((p) => ({
      url:        `product.html?id=${p._id}`,
      priority:   '0.8',
      changefreq: 'weekly',
      lastmod:    p.updatedAt.toISOString().split('T')[0],
    }));

    const base = 'https://sagona.in';
    const all  = [...staticPages, ...productPages];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map((p) => `  <url>
    <loc>${base}/${p.url}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
    ${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('sitemap error:', err);
    res.status(500).send('Failed to generate sitemap');
  }
});

export default router;
