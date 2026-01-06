import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "30s"
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

function registerAndLogin() {
  const email = `user_${__VU}_${__ITER}@example.com`;
  const password = "password123";

  const registerRes = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email, password }),
    { headers: { "content-type": "application/json" } }
  );

  check(registerRes, {
    "register 200": (r) => r.status === 200
  });

  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { "content-type": "application/json" } }
  );

  check(loginRes, {
    "login 200": (r) => r.status === 200
  });

  const body = loginRes.json();
  return body.accessToken;
}

function createOrder(token) {
  const res = http.post(
    `${BASE_URL}/orders`,
    JSON.stringify({
      items: [
        { price: 100, quantity: 1 },
        { price: 50, quantity: 2 }
      ]
    }),
    {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      }
    }
  );

  check(res, {
    "create order 200": (r) => r.status === 200
  });

  return res.json().orderId;
}

function listOrders(token) {
  const res = http.get(`${BASE_URL}/orders/me`, {
    headers: { authorization: `Bearer ${token}` }
  });

  check(res, {
    "list orders 200": (r) => r.status === 200
  });
}

export default function () {
  const token = registerAndLogin();
  createOrder(token);
  listOrders(token);
  sleep(1);
}
