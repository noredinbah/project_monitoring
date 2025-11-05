const express = require('express');
const client = require('prom-client');
const app = express();
app.use(express.json());

const register = new client.Registry();
const stockGauge = new client.Gauge({ name: 'inventory_stock', help: 'Stock levels', labelNames: ['item'] });
const updateCounter = new client.Counter({ name: 'inventory_updates_total', help: 'Number of inventory updates', labelNames: ['operation'] });
const latency = new client.Histogram({ name: 'inventory_update_duration_seconds', help: 'Inventory update time', buckets: [0.1, 0.5, 1, 2, 5] });
const summary = new client.Summary({ name: 'inventory_update_summary', help: 'Inventory update summary' });

register.registerMetric(stockGauge);
register.registerMetric(updateCounter);
register.registerMetric(latency);
register.registerMetric(summary);
client.collectDefaultMetrics({ register });

// Initial inventory
let inventory = { 
  apple: 100, 
  banana: 50,
  orange: 75,
  grape: 30
};

// Get all inventory
app.get('/inventory', (req, res) => {
  for (let [item, qty] of Object.entries(inventory)) {
    stockGauge.set({ item }, qty);
  }
  res.json(inventory);
});

// Get specific item
app.get('/inventory/:item', (req, res) => {
  const item = req.params.item.toLowerCase();
  if (inventory.hasOwnProperty(item)) {
    res.json({ item, quantity: inventory[item] });
  } else {
    res.status(404).json({ error: `Item '${item}' not found in inventory` });
  }
});

// Decrease inventory (used during order processing)
app.post('/inventory/decrease', (req, res) => {
  const end = latency.startTimer();
  const { item, qty } = req.body;
  
  if (!item || !qty) {
    return res.status(400).json({ error: 'Missing required fields: item, qty' });
  }

  const itemLower = item.toLowerCase();
  
  if (!inventory.hasOwnProperty(itemLower)) {
    return res.status(404).json({ error: `Item '${item}' not found in inventory` });
  }

  if (inventory[itemLower] >= qty) {
    inventory[itemLower] -= qty;
    updateCounter.inc({ operation: 'decrease' });
    stockGauge.set({ item: itemLower }, inventory[itemLower]);
    summary.observe(Math.random());
    end();
    res.json({ 
      message: `Decreased ${item} by ${qty}`, 
      item: itemLower,
      newQuantity: inventory[itemLower]
    });
  } else {
    end();
    res.status(400).json({ 
      error: 'Not enough stock',
      item: itemLower,
      requested: qty,
      available: inventory[itemLower]
    });
  }
});

// Increase inventory (used for rollbacks or restocking)
app.post('/inventory/increase', (req, res) => {
  const end = latency.startTimer();
  const { item, qty } = req.body;
  
  if (!item || !qty) {
    return res.status(400).json({ error: 'Missing required fields: item, qty' });
  }

  const itemLower = item.toLowerCase();
  
  // Create item if it doesn't exist
  if (!inventory.hasOwnProperty(itemLower)) {
    inventory[itemLower] = 0;
  }

  inventory[itemLower] += qty;
  updateCounter.inc({ operation: 'increase' });
  stockGauge.set({ item: itemLower }, inventory[itemLower]);
  summary.observe(Math.random());
  end();
  
  res.json({ 
    message: `Increased ${item} by ${qty}`, 
    item: itemLower,
    newQuantity: inventory[itemLower]
  });
});

// Add new item to inventory
app.post('/inventory', (req, res) => {
  const { item, qty } = req.body;
  
  if (!item || qty === undefined) {
    return res.status(400).json({ error: 'Missing required fields: item, qty' });
  }

  const itemLower = item.toLowerCase();
  
  if (inventory.hasOwnProperty(itemLower)) {
    return res.status(409).json({ error: `Item '${item}' already exists` });
  }

  inventory[itemLower] = qty;
  updateCounter.inc({ operation: 'add' });
  stockGauge.set({ item: itemLower }, qty);
  
  res.status(201).json({ 
    message: `Added ${item} to inventory`, 
    item: itemLower,
    quantity: qty
  });
});

// Health check
app.get('/health', (req, res) => res.json({ 
  status: 'Inventory service is healthy',
  itemCount: Object.keys(inventory).length,
  totalStock: Object.values(inventory).reduce((a, b) => a + b, 0)
}));

// Metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(3003, () => console.log('🏪 Inventory Service running on port 3003'));