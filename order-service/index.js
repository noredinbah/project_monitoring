const express = require('express');
const axios = require('axios');
const client = require('prom-client');
const app = express();
app.use(express.json());

const register = new client.Registry();
const orderCounter = new client.Counter({ name: 'orders_created_total', help: 'Total orders created' });
const orderFailedCounter = new client.Counter({ name: 'orders_failed_total', help: 'Total orders failed', labelNames: ['reason'] });
const orderGauge = new client.Gauge({ name: 'orders_in_system', help: 'Active orders' });
const orderDuration = new client.Histogram({ name: 'order_processing_seconds', help: 'Order creation time', buckets: [0.1, 0.5, 1, 2, 5] });
const orderSummary = new client.Summary({ name: 'order_response_summary', help: 'Summary of order response times' });

register.registerMetric(orderCounter);
register.registerMetric(orderFailedCounter);
register.registerMetric(orderGauge);
register.registerMetric(orderDuration);
register.registerMetric(orderSummary);
client.collectDefaultMetrics({ register });

// Service URLs
const INVENTORY_SERVICE = process.env.INVENTORY_SERVICE || 'http://localhost:3003';
const PAYMENT_SERVICE = process.env.PAYMENT_SERVICE || 'http://localhost:3004';
const USER_SERVICE = process.env.USER_SERVICE || 'http://localhost:3001';

let orders = [];

app.get('/orders', (req, res) => res.json(orders));

app.get('/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === parseInt(req.params.id));
  if (order) {
    res.json(order);
  } else {
    res.status(404).json({ error: 'Order not found' });
  }
});

// Enhanced order creation with orchestration
app.post('/orders', async (req, res) => {
  const end = orderDuration.startTimer();
  const { userId, item, qty, amount } = req.body;

  // Validate input
  if (!userId || !item || !qty) {
    orderFailedCounter.inc({ reason: 'validation' });
    return res.status(400).json({ error: 'Missing required fields: userId, item, qty' });
  }

  const orderId = orders.length + 1;
  const order = {
    id: orderId,
    userId,
    item,
    qty,
    amount: amount || qty * 10, // Default price calculation
    status: 'pending',
    createdAt: new Date().toISOString(),
    steps: []
  };

  try {
    // Step 1: Verify user exists
    order.steps.push({ step: 'user_verification', status: 'started' });
    try {
      const userResponse = await axios.get(`${USER_SERVICE}/users`);
      const userExists = userResponse.data.some(u => u.id === userId);
      
      if (!userExists) {
        order.status = 'failed';
        order.steps.push({ step: 'user_verification', status: 'failed', reason: 'User not found' });
        orders.push(order);
        orderFailedCounter.inc({ reason: 'user_not_found' });
        end();
        return res.status(400).json({ error: 'User not found', order });
      }
      order.steps.push({ step: 'user_verification', status: 'completed' });
    } catch (err) {
      order.status = 'failed';
      order.steps.push({ step: 'user_verification', status: 'failed', reason: 'Service unavailable' });
      orders.push(order);
      orderFailedCounter.inc({ reason: 'user_service_error' });
      end();
      return res.status(503).json({ error: 'User service unavailable', order });
    }

    // Step 2: Check and decrease inventory
    order.steps.push({ step: 'inventory_check', status: 'started' });
    try {
      const inventoryResponse = await axios.post(`${INVENTORY_SERVICE}/inventory/decrease`, {
        item,
        qty
      });
      order.steps.push({ step: 'inventory_check', status: 'completed', data: inventoryResponse.data });
    } catch (err) {
      order.status = 'failed';
      const reason = err.response?.data?.error || 'Inventory service error';
      order.steps.push({ step: 'inventory_check', status: 'failed', reason });
      orders.push(order);
      orderFailedCounter.inc({ reason: 'inventory_error' });
      end();
      return res.status(err.response?.status || 503).json({ 
        error: reason, 
        order 
      });
    }

    // Step 3: Process payment
    order.steps.push({ step: 'payment_processing', status: 'started' });
    try {
      const paymentResponse = await axios.post(`${PAYMENT_SERVICE}/payments`, {
        orderId,
        amount: order.amount
      });
      
      const paymentSuccess = paymentResponse.data.message.includes('successful');
      
      if (paymentSuccess) {
        order.steps.push({ step: 'payment_processing', status: 'completed', data: paymentResponse.data });
        order.status = 'completed';
        order.completedAt = new Date().toISOString();
      } else {
        // Payment failed - need to rollback inventory
        order.steps.push({ step: 'payment_processing', status: 'failed', reason: 'Payment declined' });
        order.steps.push({ step: 'inventory_rollback', status: 'started' });
        
        try {
          // Rollback: add inventory back
          await axios.post(`${INVENTORY_SERVICE}/inventory/increase`, {
            item,
            qty
          });
          order.steps.push({ step: 'inventory_rollback', status: 'completed' });
        } catch (rollbackErr) {
          order.steps.push({ step: 'inventory_rollback', status: 'failed', reason: 'Rollback failed' });
          console.error('CRITICAL: Inventory rollback failed for order', orderId);
        }
        
        order.status = 'failed';
        orders.push(order);
        orderFailedCounter.inc({ reason: 'payment_failed' });
        end();
        return res.status(402).json({ error: 'Payment failed', order });
      }
    } catch (err) {
      order.status = 'failed';
      order.steps.push({ step: 'payment_processing', status: 'failed', reason: 'Service unavailable' });
      
      // Rollback inventory
      order.steps.push({ step: 'inventory_rollback', status: 'started' });
      try {
        await axios.post(`${INVENTORY_SERVICE}/inventory/increase`, {
          item,
          qty
        });
        order.steps.push({ step: 'inventory_rollback', status: 'completed' });
      } catch (rollbackErr) {
        order.steps.push({ step: 'inventory_rollback', status: 'failed' });
        console.error('CRITICAL: Inventory rollback failed for order', orderId);
      }
      
      orders.push(order);
      orderFailedCounter.inc({ reason: 'payment_service_error' });
      end();
      return res.status(503).json({ error: 'Payment service unavailable', order });
    }

    // Success!
    orders.push(order);
    orderCounter.inc();
    orderGauge.set(orders.filter(o => o.status === 'completed').length);
    orderSummary.observe(Math.random());
    end();
    
    res.status(201).json(order);

  } catch (err) {
    console.error('Unexpected error:', err);
    order.status = 'failed';
    order.steps.push({ step: 'unknown', status: 'failed', reason: err.message });
    orders.push(order);
    orderFailedCounter.inc({ reason: 'unexpected_error' });
    end();
    res.status(500).json({ error: 'Internal server error', order });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'Order service is healthy' }));

// Metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(3002, () => console.log('📦 Order Service with Orchestration running on port 3002'));