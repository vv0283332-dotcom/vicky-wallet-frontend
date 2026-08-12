"use strict";

const API = "https://vicky-wallet-api-iqm3.onrender.com";
const TOKEN_KEY = "vicky_wallet_token";

let token = localStorage.getItem(TOKEN_KEY);
let currentUser = null;
let balanceVisible = true;

const $ = id => document.getElementById(id);

function showMessage(text, type = "error") {
  const el = $("message");
  if (el) {
    el.textContent = text || "";
    el.className = text ? `message ${type}` : "message";
  }
}

function dashboardMessage(text, type = "error") {
  const el = $("dashboardMessage");
  if (el) {
    el.textContent = text || "";
    el.className = text ? `message ${type}` : "message";
  }
}

function showLogin() {
  $("loginForm").classList.remove("hidden");
  $("registerForm").classList.add("hidden");
  $("loginTab").classList.add("active");
  $("registerTab").classList.remove("active");
  showMessage("");
}

function showRegister() {
  $("loginForm").classList.add("hidden");
  $("registerForm").classList.remove("hidden");
  $("loginTab").classList.remove("active");
  $("registerTab").classList.add("active");
  showMessage("");
}

async function apiRequest(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  let data = {};
  try {
    data = await response.json();
  } catch {}

  if (response.status === 401) {
    token = null;
    currentUser = null;
    localStorage.removeItem(TOKEN_KEY);
    showAuth();
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

function showAuth() {
  $("auth").classList.remove("hidden");
  $("dashboard").classList.add("hidden");
}

function showDashboard() {
  $("auth").classList.add("hidden");
  $("dashboard").classList.remove("hidden");

  if (currentUser) {
    $("userName").textContent =
      currentUser.full_name ||
      currentUser.email ||
      "Vicky Pay";

    $("profileEmail").textContent =
      currentUser.email || "";

    $("currency").textContent =
      currentUser.currency ||
      "NGN";
  }
}

async function login(event) {
  event.preventDefault();

  try {
    showMessage("Signing in...", "success");

    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("loginEmail").value.trim(),
        password: $("loginPassword").value
      })
    });

    if (!data.token || !data.user) {
      throw new Error("Invalid login response from server.");
    }

    token = data.token;
    currentUser = data.user;

    localStorage.setItem(TOKEN_KEY, token);

    showDashboard();
    showMessage("");

    await refreshWallet();

  } catch (error) {
    showMessage(error.message);
  }
}

async function register(event) {
  event.preventDefault();

  try {
    showMessage("Creating account...", "success");

    const data = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        full_name: $("registerName").value.trim(),
        email: $("registerEmail").value.trim(),
        password: $("registerPassword").value,
        currency: $("registerCurrency").value
      })
    });

    if (data.token && data.user) {
      token = data.token;
      currentUser = data.user;
      localStorage.setItem(TOKEN_KEY, token);
      showDashboard();
      await refreshWallet();
      return;
    }

    showLogin();
    $("loginEmail").value = $("registerEmail").value.trim();
    showMessage(
      data.message || "Account created. Please sign in.",
      "success"
    );

  } catch (error) {
    showMessage(error.message);
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  showAuth();
  showLogin();
}

async function restoreSession() {
  if (!token) {
    showAuth();
    return;
  }

  try {
    const data = await apiRequest("/auth/me");

    if (!data.user) {
      throw new Error("Invalid session.");
    }

    currentUser = data.user;
    showDashboard();
    await refreshWallet();

  } catch {
    logout();
  }
}

async function refreshWallet() {
  await Promise.allSettled([
    loadBalance(),
    loadTransactions()
  ]);
}

async function loadBalance() {
  const data = await apiRequest("/wallet/balance");

  const amount =
    Number(
      data.balance ??
      data.wallet?.balance ??
      data.data?.balance ??
      0
    );

  const currency =
    data.currency ||
    data.wallet?.currency ||
    currentUser?.currency ||
    "NGN";

  $("currency").textContent = currency;

  $("balance").dataset.value =
    amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  renderBalance();
}

function renderBalance() {
  const value = $("balance").dataset.value || "0.00";
  $("balance").textContent =
    balanceVisible ? value : "••••••";
}

function toggleBalance() {
  balanceVisible = !balanceVisible;
  renderBalance();
}

async function loadTransactions(showAll = false) {
  try {
    const data = await apiRequest("/wallet/transactions");

    const transactions =
      Array.isArray(data)
        ? data
        : data.transactions ||
          data.data ||
          [];

    const list = $("transactionsList");

    if (!transactions.length) {
      list.innerHTML =
        `<div class="empty">No transactions yet.</div>`;
      return;
    }

    const rows = showAll
      ? transactions
      : transactions.slice(0, 5);

    list.innerHTML = rows.map(tx => {
      const amount = Number(tx.amount || 0);
      const positive =
        ["deposit", "credit", "received"].includes(
          String(tx.type || "").toLowerCase()
        );

      return `
        <div class="transaction">
          <div>
            <strong>${escapeHtml(tx.description || tx.type || "Transaction")}</strong>
            <small>${escapeHtml(tx.created_at || tx.timestamp || "")}</small>
          </div>
          <b class="${positive ? "positive" : "negative"}">
            ${positive ? "+" : "-"}${Math.abs(amount).toLocaleString()}
          </b>
        </div>
      `;
    }).join("");

  } catch (error) {
    $("transactionsList").innerHTML =
      `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function openMoney(type) {
  $("moneyModal").classList.remove("hidden");

  $("depositPanel").classList.add("hidden");
  $("transferPanel").classList.add("hidden");
  $("withdrawPanel").classList.add("hidden");

  if (type === "deposit") {
    $("moneyTitle").textContent = "Add money";
    $("depositPanel").classList.remove("hidden");
  }

  if (type === "transfer") {
    $("moneyTitle").textContent = "Send money";
    $("transferPanel").classList.remove("hidden");
  }

  if (type === "withdraw") {
    $("moneyTitle").textContent = "Withdraw";
    $("withdrawPanel").classList.remove("hidden");
    loadAccounts();
  }
}

function closeMoney() {
  $("moneyModal").classList.add("hidden");
}

async function deposit() {
  const amount = Number($("depositAmount").value);

  if (!Number.isFinite(amount) || amount <= 0) {
    dashboardMessage("Enter a valid amount.");
    return;
  }

  try {
    dashboardMessage("Opening secure payment...", "success");

    const data = await apiRequest("/payments/deposit", {
      method: "POST",
      body: JSON.stringify({
        amount,
        currency: currentUser?.currency || "NGN",
        provider: "flutterwave",
        payment_method: $("depositMethod").value,
        description:
          $("depositDescription").value.trim() ||
          "Wallet deposit"
      })
    });

    if (data.checkout_url) {
      window.location.href = data.checkout_url;
      return;
    }

    dashboardMessage(
      data.message || "Deposit created.",
      "success"
    );

    closeMoney();
    await refreshWallet();

  } catch (error) {
    dashboardMessage(error.message);
  }
}

async function transfer() {
  const amount = Number($("transferAmount").value);
  const recipient = $("transferRecipient").value.trim();

  if (!recipient || !Number.isFinite(amount) || amount <= 0) {
    dashboardMessage("Enter a valid recipient and amount.");
    return;
  }

  try {
    const data = await apiRequest("/wallet/transfer", {
      method: "POST",
      body: JSON.stringify({
        recipient,
        email: recipient,
        account_id: recipient,
        amount,
        description:
          $("transferDescription").value.trim() ||
          "Wallet transfer"
      })
    });

    dashboardMessage(
      data.message || "Transfer successful.",
      "success"
    );

    closeMoney();
    await refreshWallet();

  } catch (error) {
    dashboardMessage(error.message);
  }
}

async function withdraw() {
  const amount = Number($("withdrawAmount").value);
  const accountId = $("withdrawAccount").value;

  if (!Number.isFinite(amount) || amount <= 0) {
    dashboardMessage("Enter a valid withdrawal amount.");
    return;
  }

  try {
    const data = await apiRequest("/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({
        amount,
        account_id: accountId || undefined
      })
    });

    dashboardMessage(
      data.message || "Withdrawal submitted.",
      "success"
    );

    closeMoney();
    await refreshWallet();

  } catch (error) {
    dashboardMessage(error.message);
  }
}

async function loadAccounts() {
  const select = $("withdrawAccount");

  try {
    const data = await apiRequest("/linked-accounts");

    const accounts =
      Array.isArray(data)
        ? data
        : data.accounts ||
          data.data ||
          [];

    select.innerHTML =
      '<option value="">Choose account</option>';

    for (const account of accounts) {
      if (
        account.status &&
        String(account.status).toLowerCase() !== "connected"
      ) continue;

      const option = document.createElement("option");
      option.value = account.id;

      option.textContent =
        account.account_name ||
        account.bank_name ||
        account.provider ||
        "Connected account";

      select.appendChild(option);
    }

  } catch {
    select.innerHTML =
      '<option value="">No connected account</option>';
  }
}

async function loadReferrals() {
  try {
    await apiRequest("/referrals");
  } catch {}
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

$("loginForm").addEventListener("submit", login);
$("registerForm").addEventListener("submit", register);

document.addEventListener("DOMContentLoaded", restoreSession);
