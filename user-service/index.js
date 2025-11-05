// user-service.js
const express = require('express');
const client = require('prom-client');
const app = express();
app.use(express.json());

// Prometheus metrics
const register = new client.Registry();
const userCounter = new client.Counter({ name: 'users_created_total', help: 'Total users created' });
const activeUsersGauge = new client.Gauge({ name: 'active_users', help: 'Current active users' });
const requestDuration = new client.Histogram({ name: 'user_request_duration_seconds', help: 'Duration of user requests', buckets: [0.1, 0.5, 1, 2, 5] });
const responseSummary = new client.Summary({ name: 'user_response_time_summary', help: 'Summary of user response times' });

register.registerMetric(userCounter);
register.registerMetric(activeUsersGauge);
register.registerMetric(requestDuration);
register.registerMetric(responseSummary);
client.collectDefaultMetrics({ register });

let users = [{ id: 1, name: 'Alice' }];

app.get('/users', (req, res) => {
  const end = requestDuration.startTimer();
  responseSummary.observe(Math.random());
  activeUsersGauge.set(users.length);
  end();
  res.json(users);
});

app.post('/users', (req, res) => {
  const newUser = { id: users.length + 1, ...req.body };
  users.push(newUser);
  userCounter.inc();
  activeUsersGauge.set(users.length);
  res.json(newUser);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'User service is healthy' }));

// Metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(3001, () => console.log('👤 User Service running on port 3001'));
