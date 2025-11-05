const express = require('express');
const client = require('prom-client');
const app = express();
app.use(express.json());

const register = new client.Registry();
const paymentCounter = new client.Counter({ name: 'payments_total', help: 'Total payments processed' });
const successGauge = new client.Gauge({ name: 'successful_payments', help: 'Successful payments count' });
const latency = new client.Histogram({ name: 'payment_latency_seconds', help: 'Payment latency', buckets: [0.1, 0.5, 1, 2, 5] });
const summary = new client.Summary({ name: 'payment_summary', help: 'Summary of payment response times' });

register.registerMetric(paymentCounter);
register.registerMetric(successGauge);
register.registerMetric(latency);
register.registerMetric(summary);
client.collectDefaultMetrics({ register });

app.post('/payments', (req, res) => {
  const end = latency.startTimer();
  const { orderId, amount } = req.body;
  const success = Math.random() > 0.1;
  paymentCounter.inc();
  if (success) successGauge.inc();
  summary.observe(Math.random());
  end();
  res.json({
    message: success
      ? `Payment of $${amount} for order ${orderId} successful`
      : `Payment for order ${orderId} failed`,
  });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'Payment service is healthy' }));

// Metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(3004, () => console.log('💳 Payment Service running on port 3004'));
