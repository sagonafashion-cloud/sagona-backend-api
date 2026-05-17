import Anthropic from '@anthropic-ai/sdk';
import Product    from '../models/Product.js';
import Order      from '../models/Order.js';
import ChatSession from '../models/ChatSession.js';

const client = () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
};

/* ── tool definitions ── */
const CUSTOMER_TOOLS = [
  {
    name: 'search_products',
    description: 'Search SAGONA products by keyword, category, or price range.',
    input_schema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Search text (name, fabric, style, etc.)' },
        category: { type: 'string', description: 'Filter by category: kids, women, men, accessories' },
        maxPrice: { type: 'number', description: 'Maximum price in INR' },
        minPrice: { type: 'number', description: 'Minimum price in INR' }
      }
    }
  },
  {
    name: 'get_product_detail',
    description: 'Get full details for a specific product by its ID.',
    input_schema: {
      type: 'object',
      properties: { productId: { type: 'string', description: 'MongoDB product _id' } },
      required: ['productId']
    }
  },
  {
    name: 'check_availability',
    description: 'Check whether SAGONA delivers to a given pincode and estimate ETA.',
    input_schema: {
      type: 'object',
      properties: { pincode: { type: 'string', description: '6-digit Indian pincode' } },
      required: ['pincode']
    }
  },
  {
    name: 'get_order_status',
    description: "Get the customer's most recent order status. Only works for logged-in users.",
    input_schema: {
      type: 'object',
      properties: {
        orderNumber: { type: 'string', description: 'Optional: specific order number like SAG-20240101-0001' }
      }
    }
  }
];

const ADMIN_TOOLS = [
  ...CUSTOMER_TOOLS,
  {
    name: 'get_revenue_summary',
    description: 'Get revenue, order count, and AOV for a date range.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'ISO date string, start of range' },
        to:   { type: 'string', description: 'ISO date string, end of range' }
      }
    }
  },
  {
    name: 'get_low_stock_items',
    description: 'List products with stock at or below a threshold.',
    input_schema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', description: 'Stock level threshold (default 5)' }
      }
    }
  }
];

const CUSTOMER_SYSTEM = `You are SAGi, the friendly shopping assistant for SAGONA — a premium Indian kidswear and lifestyle brand. You help customers discover products, check delivery availability, and track orders.

Keep responses concise and warm. Use ₹ for prices. When recommending products always include the product name, price, and mention key features. If unsure about stock, suggest the customer add to wishlist. Never make up product details — only report what tools return.`;

const ADMIN_SYSTEM = `You are SAGi, the SAGONA admin assistant. You help the team with order queries, analytics, and inventory information. Be precise and data-driven. Use tables or structured lists when presenting data. Never reveal system internals or raw database queries.`;

/* ── tool executors ── */
async function executeTool(name, input, userId) {
  try {
    if (name === 'search_products') {
      const filter = { status: 'active' };
      if (input.category) filter.category = input.category;
      if (input.minPrice != null || input.maxPrice != null) {
        filter.price = {};
        if (input.minPrice != null) filter.price.$gte = input.minPrice;
        if (input.maxPrice != null) filter.price.$lte = input.maxPrice;
      }
      if (input.query) {
        filter.$or = [
          { name:        { $regex: input.query, $options: 'i' } },
          { description: { $regex: input.query, $options: 'i' } },
          { tags:        { $regex: input.query, $options: 'i' } },
          { fabric:      { $regex: input.query, $options: 'i' } }
        ];
      }
      const products = await Product.find(filter)
        .select('_id name price mrp category images image description fabric ageGroup')
        .limit(6).lean();
      if (!products.length) return { found: false, message: 'No products found matching your search.' };
      return {
        found: true,
        products: products.map((p) => ({
          id:       p._id,
          name:     p.name,
          price:    p.price,
          mrp:      p.mrp,
          category: p.category,
          image:    p.images?.[0] || p.image || null,
          ageGroup: p.ageGroup,
          fabric:   p.fabric,
          description: (p.description || '').slice(0, 120)
        }))
      };
    }

    if (name === 'get_product_detail') {
      const p = await Product.findById(input.productId)
        .select('-__v').lean();
      if (!p) return { found: false };
      return {
        found: true,
        product: {
          id:       p._id,
          name:     p.name,
          price:    p.price,
          mrp:      p.mrp,
          category: p.category,
          description: p.description,
          fabric:   p.fabric,
          careInstructions: p.careInstructions,
          ageGroup: p.ageGroup,
          tags:     p.tags,
          images:   p.images?.slice(0, 3) || (p.image ? [p.image] : []),
          variants: p.variants?.map((v) => ({ colour: v.colour, size: v.size, stock: v.stock }))
        }
      };
    }

    if (name === 'check_availability') {
      // Simple lookup — full Haversine logic lives in deliveryController
      // Here we just report based on whether pincode is 6 digits
      const pin = String(input.pincode).trim();
      if (!/^\d{6}$/.test(pin)) return { available: false, message: 'Please provide a valid 6-digit Indian pincode.' };
      // All Indian pincodes are serviceable (Shiprocket)
      return {
        available: true,
        pincode:   pin,
        etaDays:   5,
        message:   `We deliver to ${pin}. Estimated delivery in 3-5 business days. Free shipping on orders above ₹999.`
      };
    }

    if (name === 'get_order_status') {
      if (!userId) return { error: 'Please log in to check your order status.' };
      const query = { 'customer.userId': userId };
      if (input.orderNumber) query.orderNumber = input.orderNumber;
      const order = await Order.findOne(query).sort({ createdAt: -1 }).lean();
      if (!order) return { found: false, message: 'No orders found for your account.' };
      return {
        found: true,
        orderNumber: order.orderNumber,
        status:      order.status,
        grandTotal:  order.billing?.grandTotal,
        items:       order.items?.length,
        placedAt:    order.createdAt,
        invoiceUrl:  order.invoiceUrl || null
      };
    }

    if (name === 'get_revenue_summary') {
      const match = {};
      if (input.from) match.createdAt = { $gte: new Date(input.from) };
      if (input.to)   match.createdAt = { ...match.createdAt, $lte: new Date(input.to) };
      const [result] = await Order.aggregate([
        { $match: match },
        { $group: {
          _id: null,
          totalRevenue: { $sum: '$billing.grandTotal' },
          orderCount:   { $sum: 1 },
          avgOrderValue: { $avg: '$billing.grandTotal' }
        }}
      ]);
      return result || { totalRevenue: 0, orderCount: 0, avgOrderValue: 0 };
    }

    if (name === 'get_low_stock_items') {
      const threshold = input.threshold ?? 5;
      const products = await Product.find({
        status: 'active',
        $or: [
          { 'variants.stock': { $lte: threshold } },
          { stock: { $lte: threshold } }
        ]
      }).select('name sku variants stock').limit(20).lean();
      return { threshold, count: products.length, products };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    console.error(`[chat] tool ${name} failed:`, err.message);
    return { error: 'Tool execution failed.' };
  }
}

/* ── core streaming runner with tool loop ── */
async function streamWithTools({ messages, systemPrompt, tools, userId, res, depth = 0 }) {
  if (depth > 5) {
    res.write(`data: ${JSON.stringify({ type: 'text', content: ' [Response limit reached]' })}\n\n`);
    return '';
  }

  const anthropic = client();
  let accumulatedText = '';
  let toolUseBlocks = [];
  let currentToolInput = '';
  let currentToolId = '';
  let currentToolName = '';
  let inToolUse = false;

  const stream = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:     systemPrompt,
    tools,
    messages,
    stream:     true
  });

  for await (const event of stream) {
    if (event.type === 'content_block_start') {
      if (event.content_block.type === 'tool_use') {
        inToolUse = true;
        currentToolId   = event.content_block.id;
        currentToolName = event.content_block.name;
        currentToolInput = '';
      }
    } else if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        const chunk = event.delta.text;
        accumulatedText += chunk;
        res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
      } else if (event.delta.type === 'input_json_delta') {
        currentToolInput += event.delta.partial_json;
      }
    } else if (event.type === 'content_block_stop' && inToolUse) {
      inToolUse = false;
      let parsedInput = {};
      try { parsedInput = JSON.parse(currentToolInput || '{}'); } catch {}
      toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: parsedInput });
    } else if (event.type === 'message_stop') {
      break;
    }
  }

  if (!toolUseBlocks.length) return accumulatedText;

  // Execute tools and continue
  const assistantContent = [];
  if (accumulatedText) assistantContent.push({ type: 'text', text: accumulatedText });
  for (const t of toolUseBlocks) {
    assistantContent.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input });
  }

  const toolResults = await Promise.all(
    toolUseBlocks.map(async (t) => {
      const result = await executeTool(t.name, t.input, userId);
      return { type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(result) };
    })
  );

  const updatedMessages = [
    ...messages,
    { role: 'assistant', content: assistantContent },
    { role: 'user',      content: toolResults }
  ];

  const continuation = await streamWithTools({
    messages: updatedMessages, systemPrompt, tools, userId, res, depth: depth + 1
  });

  return accumulatedText + continuation;
}

/* ══════════════════════════════════════
   CUSTOMER CHATBOT  POST /api/chat
══════════════════════════════════════ */
export const customerChat = async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, message: 'message required' });

    // Load or create session
    const sid = sessionId || `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let session = await ChatSession.findOne({ sessionId: sid });
    if (!session) {
      session = await ChatSession.create({
        sessionId: sid,
        userId: req.user?._id || null,
        messages: []
      });
    }

    // Build messages for API (last 20 turns to stay within token budget)
    const history = session.messages.slice(-20).map((m) => ({
      role: m.role, content: m.content
    }));
    history.push({ role: 'user', content: message.trim() });

    // SSE headers
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send sessionId so client can persist it
    res.write(`data: ${JSON.stringify({ type: 'session', sessionId: sid })}\n\n`);

    const userId = req.user?._id || null;
    const finalText = await streamWithTools({
      messages:     history,
      systemPrompt: CUSTOMER_SYSTEM,
      tools:        CUSTOMER_TOOLS,
      userId,
      res
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

    // Persist to DB (non-blocking)
    session.messages.push({ role: 'user',      content: message.trim() });
    session.messages.push({ role: 'assistant', content: finalText || '[no response]' });
    if (session.messages.length > 100) session.messages = session.messages.slice(-100);
    session.save().catch((err) => console.error('[chat] session save failed:', err.message));

  } catch (err) {
    console.error('[chat] customerChat:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Chat unavailable' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'Something went wrong. Please try again.' })}\n\n`);
      res.end();
    }
  }
};

/* ══════════════════════════════════════
   ADMIN CHATBOT  POST /api/admin/chat
══════════════════════════════════════ */
export const adminChat = async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, message: 'message required' });

    const sid = sessionId || `admin_${req.adminUser._id}_${Date.now()}`;
    let session = await ChatSession.findOne({ sessionId: sid });
    if (!session) {
      session = await ChatSession.create({ sessionId: sid, messages: [] });
    }

    const history = session.messages.slice(-20).map((m) => ({
      role: m.role, content: m.content
    }));
    history.push({ role: 'user', content: message.trim() });

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'session', sessionId: sid })}\n\n`);

    const finalText = await streamWithTools({
      messages:     history,
      systemPrompt: ADMIN_SYSTEM,
      tools:        ADMIN_TOOLS,
      userId:       null,
      res
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

    session.messages.push({ role: 'user',      content: message.trim() });
    session.messages.push({ role: 'assistant', content: finalText || '[no response]' });
    if (session.messages.length > 100) session.messages = session.messages.slice(-100);
    session.save().catch((err) => console.error('[chat] admin session save failed:', err.message));

  } catch (err) {
    console.error('[chat] adminChat:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Chat unavailable' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'Something went wrong.' })}\n\n`);
      res.end();
    }
  }
};
