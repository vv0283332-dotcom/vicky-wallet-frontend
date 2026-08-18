const API =
  window.VICKY_API_URL ||
  "https://vicky-wallet-api-iqm3.onrender.com";

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
    if (response.status === 401 && token) {
      token = null;
      currentUser = null;
      localStorage.removeItem("vicky_wallet_token");
    }

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

    token = data.token || data.access_token;

    if (!token) {
      throw new Error("Server did not return an authentication token");
    }

    localStorage.setItem("vicky_wallet_token", token);

    currentUser = data.user;

    showDashboard();
    await checkOwnerAccess();

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

    token = data.token || data.access_token;

    if (!token) {
      throw new Error("Server did not return an authentication token");
    }

    localStorage.setItem("vicky_wallet_token", token);

    currentUser = data.user;

    showDashboard();
    await checkOwnerAccess();

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
    await checkOwnerAccess();

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
    $("transferRecipient").value.trim().toLowerCase();

  const value = Number($("transferAmount").value);

  const description =
    $("transferDescription").value.trim();

  if (!recipient_email || !recipient_email.includes("@")) {
    setDashboardMessage(
      "Enter the recipient's email address.",
      "error"
    );
    return;
  }

  if (!Number.isFinite(value) || value <= 0) {
    setDashboardMessage(
      "Enter a valid transfer amount.",
      "error"
    );
    return;
  }

  const button = $("transferButton");

  try {
    button.disabled = true;
    button.textContent = "Checking recipient...";

    const recipient = await apiRequest(
      `/wallet/recipient?email=${encodeURIComponent(recipient_email)}`
    );

    const confirmed =
      window.confirm(
        `Send ${value} ${recipient.currency} to ` +
        `${recipient.full_name} (${recipient.email})?`
      );

    if (!confirmed) {
      return;
    }

    button.textContent = "Sending...";

    const data = await apiRequest("/wallet/transfer", {
      method: "POST",
      body: JSON.stringify({
        recipient_email,
        amount: value,
        description
      })
    });

    $("transferRecipient").value = "";
    $("transferAmount").value = "";
    $("transferDescription").value = "";

    const info = $("transferRecipientInfo");

    if (info) {
      info.textContent = "";
      info.classList.add("hidden");
    }

    setDashboardMessage(
      data.message || "Money sent successfully.",
      "success"
    );

    await loadBalance();
    await loadTransactions();

  } catch (error) {
    setDashboardMessage(
      error.message || "Transfer failed.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Send Money";
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

function openProfile() {
  if (!currentUser) {
    setMessage("Please log in first.", "error");
    return;
  }

  const panel = document.getElementById("profilePanel");

  document.getElementById("profileName").textContent =
    currentUser.full_name || "Not available";

  document.getElementById("profileEmail").textContent =
    currentUser.email || "Not available";

  document.getElementById("profileCurrency").textContent =
    currentUser.currency ||
    currentUser.preferred_currency ||
    "USD";

  document.getElementById("profileId").textContent =
    currentUser.id || "Not available";

  const created = currentUser.created_at;

  document.getElementById("profileCreated").textContent =
    created
      ? new Date(created).toLocaleDateString()
      : "Not available";

  const name =
    currentUser.full_name ||
    currentUser.email ||
    "V";

  document.getElementById("profileAvatar").textContent =
    name.charAt(0).toUpperCase();

  panel.classList.remove("hidden");
}

function closeProfile() {
  document.getElementById("profilePanel").classList.add("hidden");
}

function editProfile() {
  if (!currentUser) return;

  document.getElementById("editFullName").value =
    currentUser.full_name || "";

  document.getElementById("editEmail").value =
    currentUser.email || "";

  document.getElementById("editCurrency").value =
    currentUser.currency || "USD";

  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";

  document.getElementById("profileEditMessage").textContent = "";

  document.getElementById("editProfileForm").classList.remove("hidden");
}

async function saveProfile() {
  const button = document.getElementById("saveProfileButton");
  const message = document.getElementById("profileEditMessage");

  const full_name =
    document.getElementById("editFullName").value.trim();

  const email =
    document.getElementById("editEmail").value.trim();

  const currency =
    document.getElementById("editCurrency").value;

  const current_password =
    document.getElementById("currentPassword").value;

  const new_password =
    document.getElementById("newPassword").value;

  message.textContent = "";

  if (!full_name) {
    message.textContent = "Full name is required.";
    return;
  }

  if (!email || !email.includes("@")) {
    message.textContent = "Enter a valid email.";
    return;
  }

  if (new_password && new_password.length < 8) {
    message.textContent =
      "New password must contain at least 8 characters.";
    return;
  }

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    const data = await apiRequest("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({
        full_name,
        email,
        currency,
        current_password,
        new_password
      })
    });

    if (!data.token || !data.user) {
      throw new Error("Invalid server response.");
    }

    token = data.token || data.access_token;
    currentUser = data.user;

    localStorage.setItem("vicky_wallet_token", token);

    document.getElementById("profileEditMessage").textContent =
      "Profile updated successfully.";

    document.getElementById("editProfileForm")
      .classList.add("hidden");

    openProfile();

    setDashboardMessage(
      "Profile updated successfully.",
      "success"
    );

    await loadBalance();

  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Save Changes";
  }
}

async function checkOwnerAccess() {
  const button = document.getElementById("ownerButton");

  if (!button || !token || !currentUser) {
    return;
  }

  try {
    await apiRequest("/admin/stats");
    button.classList.remove("hidden");
  } catch {
    button.classList.add("hidden");
  }
}

async function openOwnerDashboard() {
  const panel = document.getElementById("ownerDashboard");

  if (!panel) return;

  panel.classList.remove("hidden");

  document.getElementById("ownerMessage").textContent =
    "Loading owner dashboard...";

  try {
    await loadAdminStats();
    await loadAdminUsers();
    await loadAdminTransactions();

    document.getElementById("ownerMessage").textContent =
      "Owner dashboard loaded.";
  } catch (error) {
    document.getElementById("ownerMessage").textContent =
      error.message || "Unable to load owner dashboard.";
  }
}

function closeOwnerDashboard() {
  document.getElementById("ownerDashboard")
    .classList.add("hidden");
}

async function loadAdminStats() {
  const data = await apiRequest("/admin/stats");

  document.getElementById("adminUsers").textContent =
    data.users ?? 0;

  document.getElementById("adminBalance").textContent =
    Number(data.total_balance || 0).toFixed(2);

  document.getElementById("adminTransactions").textContent =
    data.transactions ?? 0;

  document.getElementById("adminDeposits").textContent =
    Number(data.deposits?.total || 0).toFixed(2);

  document.getElementById("adminWithdrawals").textContent =
    Number(data.withdrawals?.total || 0).toFixed(2);

  document.getElementById("adminTransfers").textContent =
    Number(data.transfers?.total || 0).toFixed(2);
}

async function loadAdminUsers() {
  const box = document.getElementById("adminUsersList");

  const data = await apiRequest("/admin/users?limit=100");

  if (!data.users || data.users.length === 0) {
    box.innerHTML = '<p class="empty">No users found.</p>';
    return;
  }

  box.innerHTML = data.users.map(user => `
    <div class="admin-user">
      <div>
        <strong>${escapeHtml(user.full_name)}</strong>
        <small>${escapeHtml(user.email)}</small>
      </div>

      <div>
        <strong>${Number(user.balance).toFixed(2)} ${escapeHtml(user.currency)}</strong>
        <small>${new Date(user.created_at).toLocaleDateString()}</small>
      </div>
    </div>
  `).join("");
}

async function loadAdminTransactions() {
  const box = document.getElementById("adminTransactionsList");

  const data = await apiRequest("/admin/transactions?limit=100");

  if (!data.transactions || data.transactions.length === 0) {
    box.innerHTML = '<p class="empty">No transactions found.</p>';
    return;
  }

  box.innerHTML = data.transactions.map(item => `
    <div class="admin-transaction">
      <div>
        <strong>${escapeHtml(item.type)}</strong>
        <small>${escapeHtml(item.email || "")}</small>
      </div>

      <div>
        <strong>${Number(item.amount).toFixed(2)} ${escapeHtml(item.currency)}</strong>
        <small>${new Date(item.created_at).toLocaleString()}</small>
      </div>
    </div>
  `).join("");
}

