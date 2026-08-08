const API = "https://vicky-wallet-api-iqm3.onrender.com";

let token = localStorage.getItem("vicky_wallet_token");
let currentUser = null;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMessage(text, type = "error") {
  const box = $("message");
  if (!box) return;

  box.className = text ? `message ${type}` : "";
  box.textContent = text || "";
}

function setDashboardMessage(text, type = "error") {
  const box = $("dashboardMessage");
  if (!box) return;

  box.className = text ? `message ${type}` : "";
  box.textContent = text || "";
}

function showLogin() {
  $("loginForm").classList.remove("hidden");
  $("registerForm").classList.add("hidden");

  $("loginTab").classList.add("active");
  $("registerTab").classList.remove("active");

  setMessage("");
}

function showRegister() {
  $("loginForm").classList.add("hidden");
  $("registerForm").classList.remove("hidden");

  $("loginTab").classList.remove("active");
  $("registerTab").classList.add("active");

  setMessage("");
}

function setLoading(button, loading, text) {
  button.disabled = loading;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
  } else {
    button.textContent = button.dataset.originalText || text;
  }
}

async function apiRequest(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  let data;

  try {
    data = await response.json();
  } catch {
    data = {};
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

async function login(event) {
  event.preventDefault();

  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  const button = $("loginButton");

  setMessage("");
  setLoading(button, true, "Logging in...");

  try {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password
      })
    });

    token = data.token;

    if (!token) {
      throw new Error("Server did not return an authentication token");
    }

    localStorage.setItem("vicky_wallet_token", token);

    currentUser = data.user;

    showDashboard();

    setDashboardMessage("Login successful.", "success");

    await loadBalance();
    await loadTransactions();

  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setLoading(button, false, "Login");
  }
}

async function register(event) {
  event.preventDefault();

  const full_name = $("fullName").value.trim();
  const email = $("registerEmail").value.trim();
  const password = $("registerPassword").value;
  const preferred_currency = $("currency").value;

  const button = $("registerButton");

  setMessage("");
  setLoading(button, true, "Creating...");

  try {
    const data = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        full_name,
        email,
        password,
        preferred_currency
      })
    });

    token = data.token;

    if (!token) {
      throw new Error("Server did not return an authentication token");
    }

    localStorage.setItem("vicky_wallet_token", token);

    currentUser = data.user;

    showDashboard();

    setDashboardMessage(
      "Account created successfully.",
      "success"
    );

    await loadBalance();
    await loadTransactions();

  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setLoading(button, false, "Create Account");
  }
}

function showDashboard() {
  $("authSection").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");

  if (currentUser) {
    $("userName").textContent =
      currentUser.full_name || currentUser.email;
  }
}

function showAuth() {
  $("authSection").classList.remove("hidden");
  $("dashboard").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
}

async function loadCurrentUser() {
  try {
    const data = await apiRequest("/auth/me");

    currentUser = data.user;

    showDashboard();

    await loadBalance();
    await loadTransactions();

  } catch {
    logout(false);
  }
}

async function loadBalance() {
  try {
    const data = await apiRequest("/wallet/balance");

    const balance = Number(data.balance || 0);
    const currency = data.currency || "USD";

    $("balance").textContent =
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency
      }).format(balance);

    $("currencyLabel").textContent = currency;

  } catch (error) {
    setDashboardMessage(error.message, "error");
  }
}

async function deposit() {
  const value = $("depositAmount").value;
  const description =
    $("depositDescription").value.trim();

  if (!value || Number(value) <= 0) {
    setDashboardMessage(
      "Enter a valid deposit amount.",
      "error"
    );
    return;
  }

  try {
    const data = await apiRequest("/wallet/deposit", {
      method: "POST",
      body: JSON.stringify({
        amount: Number(value),
        description
      })
    });

    $("depositAmount").value = "";
    $("depositDescription").value = "";

    setDashboardMessage(
      data.message || "Deposit successful.",
      "success"
    );

    await loadBalance();
    await loadTransactions();

  } catch (error) {
    setDashboardMessage(error.message, "error");
  }
}

async function withdraw() {
  const value = $("withdrawAmount").value;
  const description =
    $("withdrawDescription").value.trim();

  if (!value || Number(value) <= 0) {
    setDashboardMessage(
      "Enter a valid withdrawal amount.",
      "error"
    );
    return;
  }

  try {
    const data = await apiRequest("/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({
        amount: Number(value),
        description
      })
    });

    $("withdrawAmount").value = "";
    $("withdrawDescription").value = "";

    setDashboardMessage(
      data.message || "Withdrawal successful.",
      "success"
    );

    await loadBalance();
    await loadTransactions();

  } catch (error) {
    setDashboardMessage(error.message, "error");
  }
}

async function transfer() {
  const recipient_email =
    $("recipientEmail").value.trim();

  const value = $("transferAmount").value;

  const description =
    $("transferDescription").value.trim();

  if (!recipient_email) {
    setDashboardMessage(
      "Enter the recipient email.",
      "error"
    );
    return;
  }

  if (!value || Number(value) <= 0) {
    setDashboardMessage(
      "Enter a valid transfer amount.",
      "error"
    );
    return;
  }

  try {
    const data = await apiRequest("/wallet/transfer", {
      method: "POST",
      body: JSON.stringify({
        recipient_email,
        amount: Number(value),
        description
      })
    });

    $("recipientEmail").value = "";
    $("transferAmount").value = "";
    $("transferDescription").value = "";

    setDashboardMessage(
      data.message || "Transfer successful.",
      "success"
    );

    await loadBalance();
    await loadTransactions();

  } catch (error) {
    setDashboardMessage(error.message, "error");
  }
}

async function loadTransactions() {
  try {
    const data =
      await apiRequest("/wallet/transactions?limit=50");

    const transactions = data.transactions || [];
    const box = $("transactions");

    if (!transactions.length) {
      box.innerHTML =
        '<p class="empty">No transactions yet.</p>';
      return;
    }

    box.innerHTML = transactions.map(tx => {

      const positive =
        tx.type === "deposit" ||
        tx.type === "transfer_received";

      const sign = positive ? "+" : "-";

      const date = tx.created_at
        ? new Date(tx.created_at).toLocaleString()
        : "";

      return `
        <div class="transaction">
          <div>
            <strong>${escapeHtml(tx.type)}</strong>
            <span>${escapeHtml(tx.description || "")}</span>
            <small>${escapeHtml(date)}</small>
          </div>

          <div class="${positive ? "positive" : "negative"}">
            ${sign}${escapeHtml(tx.amount)} ${escapeHtml(tx.currency)}
          </div>
        </div>
      `;
    }).join("");

  } catch (error) {
    $("transactions").innerHTML =
      `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

function logout(showMessage = true) {
  token = null;
  currentUser = null;

  localStorage.removeItem("vicky_wallet_token");

  showAuth();
  showLogin();

  if (showMessage) {
    setMessage("You have been logged out.", "success");
  }
}

window.addEventListener("load", () => {
  if (token) {
    loadCurrentUser();
  } else {
    showAuth();
  }
});
