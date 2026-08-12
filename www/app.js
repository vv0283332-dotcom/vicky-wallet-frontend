"use strict";

const API = "https://vicky-wallet-api-iqm3.onrender.com";
const TOKEN_KEY = "vicky_wallet_token";

let token = localStorage.getItem(TOKEN_KEY) || "";
let currentUser = null;
let currentBalance = 0;
let balanceVisible = true;

const $ = id => document.getElementById(id);

function message(id, text = "", type = "error") {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = text ? `message ${type}` : "message";
}

function setBusy(button, busy, normalText) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? "Please wait..." : normalText;
}

function saveToken(value) {
  token = value || "";
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function apiRequest(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };

  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  let data = {};
  try {
    data = await response.json();
  } catch {}

  if (response.status === 401) {
    saveToken("");
    currentUser = null;
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
  $("moneyScreen").classList.add("hidden");
}

function showDashboard() {
  $("auth").classList.add("hidden");
  $("moneyScreen").classList.add("hidden");
  $("dashboard").classList.remove("hidden");

  if (!currentUser) return;

  $("userName").textContent =
    currentUser.full_name ||
    currentUser.name ||
    currentUser.email ||
    "Vicky Pay";

  $("profileEmail").textContent = currentUser.email || "—";
  $("profileCurrency").textContent = currentUser.currency || "NGN";
  $("currency").textContent = currentUser.currency || "NGN";
}

function showLogin() {
  $("loginForm").classList.remove("hidden");
  $("registerForm").classList.add("hidden");
  $("loginTab").classList.add("active");
  $("registerTab").classList.remove("active");
  message("authMessage");
}

function showRegister() {
  $("loginForm").classList.add("hidden");
  $("registerForm").classList.remove("hidden");
  $("loginTab").classList.remove("active");
  $("registerTab").classList.add("active");
  message("authMessage");
}

async function login(event) {
  event.preventDefault();

  const button = $("loginButton");
  setBusy(button, true, "Login");

  try {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("loginEmail").value.trim(),
        password: $("loginPassword").value
      })
    });

    if (!data.token) throw new Error("Authentication token was not returned.");

    saveToken(data.token);
    currentUser = data.user || null;

    showDashboard();
    await refreshDashboard();
  } catch (error) {
    message("authMessage", error.message);
  } finally {
    setBusy(button, false, "Login");
  }
}

async function register(event) {
  event.preventDefault();

  const button = $("registerButton");
  setBusy(button, true, "Create account");

  try {
    const data = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        full_name: $("registerName").value.trim(),
        email: $("registerEmail").value.trim(),
        password: $("registerPassword").value,
        currency: $("registerCurrency").value
      })
    });

    if (data.token) {
      saveToken(data.token);
      currentUser = data.user || null;
      showDashboard();
      await refreshDashboard();
    } else {
      showLogin();
      $("loginEmail").value = $("registerEmail").value.trim();
      message("authMessage", "Account created. Please sign in.", "success");
    }
  } catch (error) {
    message("authMessage", error.message);
  } finally {
    setBusy(button, false, "Create account");
  }
}

async function restoreSession() {
  if (!token) {
    showAuth();
    showLogin();
    return;
  }

  try {
    const data = await apiRequest("/auth/me");
    currentUser = data.user || data;
    showDashboard();
    await refreshDashboard();
  } catch {
    saveToken("");
    currentUser = null;
    showAuth();
    showLogin();
  }
}

async function logout() {
  try {
    if (token) {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      });
    }
  } catch {}

  saveToken("");
  currentUser = null;
  currentBalance = 0;
  showAuth();
  showLogin();
}

function formatMoney(value) {
  const amount = Number(value || 0);
  const currency = currentUser?.currency || "NGN";

  try {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

async function loadBalance() {
  const data = await apiRequest("/wallet/balance");

  const balance =
    data.balance ??
    data.wallet?.balance ??
    data.data?.balance ??
    0;

  currentBalance = Number(balance) || 0;
  renderBalance();
}

function renderBalance() {
  $("balance").textContent =
    balanceVisible ? formatMoney(currentBalance) : "••••••";
}

async function loadTransactions() {
  const data = await apiRequest("/wallet/transactions");

  const transactions =
    Array.isArray(data) ? data :
    data.transactions || data.data || [];

  renderTransactions(transactions);
}

function transactionText(transaction) {
  return (
    transaction.description ||
    transaction.type ||
    transaction.category ||
    "Wallet transaction"
  );
}

function transactionAmount(transaction) {
  return Number(
    transaction.amount ??
    transaction.value ??
    0
  );
}

function renderTransactions(transactions) {
  const containers = [
    $("transactionsList"),
    $("fullTransactions")
  ].filter(Boolean);

  for (const container of containers) {
    container.innerHTML = "";

    if (!transactions.length) {
      container.innerHTML = '<div class="empty">No transactions yet.</div>';
      continue;
    }

    for (const transaction of transactions.slice(0, 50)) {
      const row = document.createElement("div");
      row.className = "transaction";

      const amount = transactionAmount(transaction);
      const positive =
        String(transaction.type || transaction.direction || "")
          .toLowerCase()
          .includes("deposit") ||
        String(transaction.direction || "").toLowerCase() === "credit";

      row.innerHTML = `
        <div>
          <strong>${escapeHtml(transactionText(transaction))}</strong>
          <small>${escapeHtml(
            transaction.created_at ||
            transaction.createdAt ||
            transaction.date ||
            ""
          )}</small>
        </div>
        <strong class="${positive ? "positive" : "negative"}">
          ${positive ? "+" : "-"}${formatMoney(Math.abs(amount))}
        </strong>
      `;

      container.appendChild(row);
    }
  }
}

async function refreshDashboard() {
  await Promise.allSettled([
    loadBalance(),
    loadTransactions(),
    loadAccounts()
  ]);
}

function openScreen(type) {
  $("dashboard").classList.add("hidden");
  $("moneyScreen").classList.remove("hidden");

  for (const id of [
    "depositPanel",
    "transferPanel",
    "withdrawPanel",
    "historyPanel",
    "accountsPanel",
    "notificationsPanel",
    "profilePanel"
  ]) {
    $(id).classList.add("hidden");
  }

  const map = {
    deposit: ["depositPanel", "Add Money"],
    transfer: ["transferPanel", "Send Money"],
    withdraw: ["withdrawPanel", "Withdraw"],
    history: ["historyPanel", "Transaction History"],
    accounts: ["accountsPanel", "Connected Accounts"],
    notifications: ["notificationsPanel", "Notifications"],
    profile: ["profilePanel", "Profile"]
  };

  const item = map[type] || map.deposit;
  $(item[0]).classList.remove("hidden");
  $("screenTitle").textContent = item[1];

  message("screenMessage");

  if (type === "accounts") loadAccounts();
  if (type === "history") loadTransactions();
  if (type === "notifications") loadNotifications();
  if (type === "profile") populateProfile();
}

function closeScreen() {
  $("moneyScreen").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  message("screenMessage");
}

async function loadAccounts() {
  try {
    const data = await apiRequest("/linked-accounts");
    const accounts =
      Array.isArray(data) ? data :
      data.accounts || data.data || [];

    renderAccounts(accounts);
  } catch (error) {
    renderAccounts([]);
    if (!$("accountsPanel").classList.contains("hidden")) {
      message("screenMessage", error.message);
    }
  }
}

function renderAccounts(accounts) {
  const lists = [
    $("accountsList"),
    $("depositAccount"),
    $("withdrawAccount")
  ];

  if ($("accountsList")) {
    $("accountsList").innerHTML = "";

    if (!accounts.length) {
      $("accountsList").innerHTML =
        '<div class="empty">No connected accounts.</div>';
    }

    for (const account of accounts) {
      const item = document.createElement("div");
      item.className = "account-item";

      item.innerHTML = `
        <strong>${escapeHtml(
          account.account_name ||
          account.bank_name ||
          account.provider ||
          "Connected account"
        )}</strong>
        <small>${escapeHtml(
          account.masked_account_number ||
          account.account_number ||
          account.currency ||
          ""
        )}</small>
      `;

      $("accountsList").appendChild(item);
    }
  }

  for (const select of lists.slice(1)) {
    if (!select) continue;

    select.innerHTML =
      '<option value="">Choose connected account</option>';

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
  }
}

async function deposit() {
  const amount = Number($("depositAmount").value);

  if (!Number.isFinite(amount) || amount <= 0) {
    message("screenMessage", "Enter a valid deposit amount.");
    return;
  }

  const button = $("depositButton");
  setBusy(button, true, "Continue");

  try {
    const accountId = $("depositAccount").value || undefined;

    const data = await apiRequest("/payments/deposit", {
      method: "POST",
      body: JSON.stringify({
        amount,
        currency: currentUser?.currency || "NGN",
        provider: "flutterwave",
        payment_method: $("depositMethod").value,
        source_account_id: accountId,
        description:
          $("depositDescription").value.trim() ||
          "Wallet deposit"
      })
    });

    if (data.checkout_url) {
      window.location.href = data.checkout_url;
      return;
    }

    message(
      "screenMessage",
      data.message || "Deposit started.",
      "success"
    );

    await refreshDashboard();
  } catch (error) {
    message("screenMessage", error.message);
  } finally {
    setBusy(button, false, "Continue");
  }
}

async function transfer() {
  const recipient = $("transferRecipient").value.trim();
  const amount = Number($("transferAmount").value);

  if (!recipient || !Number.isFinite(amount) || amount <= 0) {
    message("screenMessage", "Enter a valid recipient and amount.");
    return;
  }

  const button = $("transferButton");
  setBusy(button, true, "Send Money");

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

    message(
      "screenMessage",
      data.message || "Transfer successful.",
      "success"
    );

    $("transferRecipient").value = "";
    $("transferAmount").value = "";
    $("transferDescription").value = "";

    await refreshDashboard();
  } catch (error) {
    message("screenMessage", error.message);
  } finally {
    setBusy(button, false, "Send Money");
  }
}

async function withdraw() {
  const amount = Number($("withdrawAmount").value);
  const accountId = $("withdrawAccount").value;

  if (!Number.isFinite(amount) || amount <= 0) {
    message("screenMessage", "Enter a valid withdrawal amount.");
    return;
  }

  if (!accountId) {
    message("screenMessage", "Choose a connected account.");
    return;
  }

  const button = $("withdrawButton");
  setBusy(button, true, "Withdraw");

  try {
    const data = await apiRequest("/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({
        amount,
        account_id: accountId
      })
    });

    message(
      "screenMessage",
      data.message || "Withdrawal submitted.",
      "success"
    );

    await refreshDashboard();
  } catch (error) {
    message("screenMessage", error.message);
  } finally {
    setBusy(button, false, "Withdraw");
  }
}

async function loadNotifications() {
  try {
    const data = await apiRequest("/notifications");
    const notifications =
      Array.isArray(data) ? data :
      data.notifications || data.data || [];

    const list = $("notificationsList");
    list.innerHTML = "";

    if (!notifications.length) {
      list.innerHTML = '<div class="empty">No notifications.</div>';
      return;
    }

    for (const item of notifications) {
      const row = document.createElement("div");
      row.className = "transaction";
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(item.title || "Notification")}</strong>
          <small>${escapeHtml(item.message || "")}</small>
        </div>
      `;
      list.appendChild(row);
    }
  } catch (error) {
    message("screenMessage", error.message);
  }
}

function populateProfile() {
  $("profileName").value =
    currentUser?.full_name ||
    currentUser?.name ||
    "";

  $("profileEmailInput").value =
    currentUser?.email ||
    "";
}

async function saveProfile() {
  try {
    const data = await apiRequest("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({
        full_name: $("profileName").value.trim()
      })
    });

    currentUser =
      data.user ||
      data ||
      currentUser;

    showDashboard();
    message("dashboardMessage", "Profile updated.", "success");
  } catch (error) {
    message("screenMessage", error.message);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

$("loginTab").addEventListener("click", showLogin);
$("registerTab").addEventListener("click", showRegister);
$("loginForm").addEventListener("submit", login);
$("registerForm").addEventListener("submit", register);
$("logoutButton").addEventListener("click", logout);
$("balanceToggle").addEventListener("click", () => {
  balanceVisible = !balanceVisible;
  renderBalance();
});

$("backButton").addEventListener("click", closeScreen);
$("depositButton").addEventListener("click", deposit);
$("transferButton").addEventListener("click", transfer);
$("withdrawButton").addEventListener("click", withdraw);
$("historyButton").addEventListener("click", () => openScreen("history"));
$("accountsButton").addEventListener("click", () => openScreen("accounts"));
$("notificationsButton").addEventListener("click", () => openScreen("notifications"));
$("profileButton").addEventListener("click", () => openScreen("profile"));
$("profileSaveButton").addEventListener("click", saveProfile);

document.querySelectorAll("[data-action]").forEach(button => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "history") openScreen("history");
    else openScreen(action);
  });
});

document.querySelectorAll("[data-nav]").forEach(button => {
  button.addEventListener("click", () => {
    const action = button.dataset.nav;
    if (action === "home") {
      closeScreen();
      return;
    }
    if (action === "history") openScreen("history");
    else openScreen(action);
  });
});

document.addEventListener("DOMContentLoaded", restoreSession);
