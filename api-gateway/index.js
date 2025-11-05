const express = require('express');
const axios = require('axios');
const cors = require('cors'); // <-- import cors
const app = express();

app.use(express.json());
app.use(cors()); // <-- enable CORS for all routes

// Define service URLs
const services = {
  user: 'http://localhost:3001',
  order: 'http://localhost:3002',
  inventory: 'http://localhost:3003',
  payment: 'http://localhost:3004',
};

// Simple routing logic
app.use('/user', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${services.user}${req.url}`,
      data: req.body,
    });
    res.status(response.status).send(response.data);
  } catch (err) {
    res.status(500).send({ error: 'User Service unavailable' });
  }
});

app.use('/order', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${services.order}${req.url}`,
      data: req.body,
    });
    res.status(response.status).send(response.data);
  } catch (err) {
    res.status(500).send({ error: 'Order Service unavailable' });
  }
});

app.use('/inventory', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${services.inventory}${req.url}`,
      data: req.body,
    });
    res.status(response.status).send(response.data);
  } catch (err) {
    res.status(500).send({ error: 'Inventory Service unavailable' });
  }
});

app.use('/payment', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${services.payment}${req.url}`,
      data: req.body,
    });
    res.status(response.status).send(response.data);
  } catch (err) {
    res.status(500).send({ error: 'Payment Service unavailable' });
  }
});

app.listen(4000, () => console.log('🧭 API Gateway running on port 4000 with CORS enabled'));
