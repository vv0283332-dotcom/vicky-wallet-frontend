
function showLoginScreen() {
  const auth = $("auth");
  const dashboard = $("dashboard");
  const logoutBtn = $("logoutBtn");

  if (auth) auth.classList.remove("hidden");
  if (dashboard) {
    dashboard.classList.add("hidden");
    dashboard.setAttribute("aria-hidden", "true");
  }
  if (logoutBtn) logoutBtn.classList.add("hidden");
}

function showDashboardScreen() {
  const auth = $("auth");
  const dashboard = $("dashboard");

  if (auth) auth.classList.add("hidden");

  if (dashboard) {
    dashboard.classList.remove("hidden");
    dashboard.setAttribute("aria-hidden", "false");
  }
}

const API = "https://vicky-wallet-api-iqm3.onrender.com";

let token = localStorage.getItem("vicky_wallet_token");
let currentUser = null;
let notificationTimer = null;

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
    updateDashboardAccountId();
    await checkOwnerAccess();

    setDashboardMessage("Login successful.", "success");

    await loadBalance();
    await loadTransactions();
    startNotificationPolling();

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
    updateDashboardAccountId();
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
  $("auth").classList.add("hidden");
  showDashboardScreen();
  $("logoutBtn").classList.remove("hidden");

  if (currentUser) {
    $("userName").textContent =
      currentUser.full_name || currentUser.email;
  }
}

function showAuth() {
  $("auth").classList.remove("hidden");
  $("dashboard").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
}

async function loadCurrentUser() {
  try {
    const data = await apiRequest("/auth/me");

    currentUser = data.user;

    showDashboard();
    updateDashboardAccountId();
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

function toggleMoneyPanel(panel) {
  const panels = [
    $("depositPanel"),
    $("withdrawPanel"),
    $("transferPanel")
  ];

  const target = $(panel);

  if (!target) {
    console.error("Money panel not found:", panel);
    return;
  }

  const wasOpen = target.classList.contains("money-panel-open");

  panels.forEach((item) => {
    if (item) {
      item.classList.remove("money-panel-open");
    }
  });

  if (!wasOpen) {
    target.classList.add("money-panel-open");

    setTimeout(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 50);
  }
}

async function deposit() {
  const value = $("depositAmount").value;
  const description = $("depositDescription").value.trim();

  if (!value || Number(value) <= 0) {
    setDashboardMessage("Enter a valid deposit amount.", "error");
    return;
  }

  try {
    setDashboardMessage("Opening secure payment checkout...", "success");

    const data = await apiRequest("/payments/deposit", {
      method: "POST",
      body: JSON.stringify({
        amount: Number(value),
        description
      })
    });

    if (!data.checkout_url) {
      throw new Error("Payment checkout could not be created.");
    }

    $("depositAmount").value = "";
    $("depositDescription").value = "";

    window.location.href = data.checkout_url;

  } catch (error) {
    setDashboardMessage(
      error.message || "Unable to start payment.",
      "error"
    );
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


async function loadNotifications() {
  if (!token || !currentUser) return;

  try {
    const data = await apiRequest("/notifications?limit=50");
    const notifications = data.notifications || [];
    const unread = Number(data.unread_count || 0);

    const badge = $("notificationBadge");
    const list = $("notificationsList");
    const summary = $("notificationSummary");

    if (badge) {
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.classList.toggle("hidden", unread === 0);
    }

    if (summary) {
      summary.textContent =
        unread === 0
          ? "No new notifications"
          : `${unread} unread notification${unread === 1 ? "" : "s"}`;
    }

    if (!list) return;

    if (!notifications.length) {
      list.innerHTML =
        '<p class="empty">No notifications yet.</p>';
      return;
    }

    list.innerHTML = notifications.map(notification => {
      const unreadClass =
        Number(notification.read) === 0
          ? " notification-unread"
          : "";

      const iconMap = {
        login: "🔐",
        account: "🎉",
        transfer_sent: "💸",
        transfer_received: "📥",
        deposit: "💰",
        deposit_completed: "✅",
        withdrawal: "💳",
        profile: "👤",
        activity: "🔔"
      };

      const icon =
        iconMap[notification.type] || "🔔";

      const date = notification.created_at
        ? new Date(notification.created_at).toLocaleString()
        : "";

      return `
        <button
          class="notification-item${unreadClass}"
          onclick="readNotification('${escapeHtml(notification.id)}')"
        >
          <span class="notification-icon">${icon}</span>
          <span class="notification-content">
            <strong>${escapeHtml(notification.title)}</strong>
            <span>${escapeHtml(notification.message)}</span>
            <small>${escapeHtml(date)}</small>
          </span>
        </button>
      `;
    }).join("");

  } catch (error) {
    console.error("Notification load error:", error);
  }
}

function toggleNotifications() {
  const panel = $("notificationPanel");
  if (!panel) return;

  panel.classList.toggle("hidden");

  if (!panel.classList.contains("hidden")) {
    loadNotifications();
  }
}

async function readNotification(notificationId) {
  try {
    await apiRequest(
      `/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "PATCH" }
    );

    await loadNotifications();
  } catch (error) {
    console.error("Notification read error:", error);
  }
}

async function markAllNotificationsRead() {
  try {
    await apiRequest("/notifications/read-all", {
      method: "POST"
    });

    await loadNotifications();
  } catch (error) {
    setDashboardMessage(
      error.message || "Unable to update notifications.",
      "error"
    );
  }
}

function startNotificationPolling() {
  stopNotificationPolling();

  loadNotifications();

  notificationTimer = setInterval(() => {
    if (token && currentUser) {
      loadNotifications();
    }
  }, 15000);
}

function stopNotificationPolling() {
  if (notificationTimer) {
    clearInterval(notificationTimer);
    notificationTimer = null;
  }
}

function getMyAccountId() {
  return (
    currentUser?.account_id ||
    currentUser?.accountId ||
    ""
  ).toUpperCase();
}

function updateDashboardAccountId() {
  const accountId = getMyAccountId();
  const el = $("dashboardAccountId");

  if (el) {
    el.textContent = accountId || "Unavailable";
  }
}

async function copyAccountId() {
  const accountId = getMyAccountId();

  if (!accountId) {
    setDashboardMessage(
      "Your Account ID is not available.",
      "error"
    );
    return;
  }

  try {
    await navigator.clipboard.writeText(accountId);

    setDashboardMessage(
      `Account ID ${accountId} copied.`,
      "success"
    );
  } catch {
    setDashboardMessage(
      "Could not copy Account ID.",
      "error"
    );
  }
}

function clearRecipientPreview() {
  const box = $("recipientPreview");

  if (!box) return;

  box.classList.add("hidden");
  box.innerHTML = "";
}

async function findRecipient() {
  const input = $("recipientAccountId");

  if (!input) return;

  const accountId = input.value.trim().toUpperCase();
  input.value = accountId;

  if (!/^VW-[0-9]{8}$/.test(accountId)) {
    setDashboardMessage(
      "Enter a valid Account ID, e.g. VW-12345678.",
      "error"
    );
    return;
  }

  if (accountId === getMyAccountId()) {
    setDashboardMessage(
      "You cannot send money to your own account.",
      "error"
    );
    return;
  }

  try {
    const recipient = await apiRequest(
      `/wallet/recipient/${encodeURIComponent(accountId)}`
    );

    const box = $("recipientPreview");

    if (box) {
      box.innerHTML = `
        <strong>Recipient verified ✓</strong>
        <span>${recipient.full_name}</span>
        <small>${recipient.account_id} · ${recipient.currency}</small>
      `;

      box.classList.remove("hidden");
    }

    setDashboardMessage(
      `Recipient verified: ${recipient.full_name}`,
      "success"
    );

    return recipient;

  } catch (error) {
    clearRecipientPreview();

    setDashboardMessage(
      error.message || "Recipient not found.",
      "error"
    );

    return null;
  }
}

async function transfer() {
  const recipientAccountId =
    $("recipientAccountId").value.trim().toUpperCase();

  const value = $("transferAmount").value;

  const description =
    $("transferDescription").value.trim();

  if (!/^VW-[0-9]{8}$/.test(recipientAccountId)) {
    setDashboardMessage(
      "Enter a valid recipient Account ID, e.g. VW-12345678.",
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
    const recipient = await apiRequest(
      `/wallet/recipient/${encodeURIComponent(recipientAccountId)}`
    );

    const confirmed = window.confirm(
      `Send ${Number(value).toFixed(2)} ${recipient.currency} to ${recipient.full_name} (${recipient.account_id})?`
    );

    if (!confirmed) {
      return;
    }

    const data = await apiRequest("/wallet/transfer", {
      method: "POST",
      body: JSON.stringify({
        recipient_account_id: recipientAccountId,
        amount: Number(value),
        description
      })
    });

    $("recipientAccountId").value = "";
    $("transferAmount").value = "";
    $("transferDescription").value = "";

    clearRecipientPreview();

    setDashboardMessage(
      data.message || "Transfer successful.",
      "success"
    );

    await loadBalance();
    await loadTransactions();

  } catch (error) {
    setDashboardMessage(
      error.message || "Transfer failed.",
      "error"
    );
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

    token = data.token;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   VICKY WALLET — TRANSACTION DASHBOARD CONTROLS
   ========================================================= */

(function setupTransactionDashboard() {
  const setup = () => {
    const dashboard = document.getElementById("dashboard");
    const transactions = document.getElementById("transactions");

    if (!dashboard || !transactions) return;

    if (!document.getElementById("vickyTransactionToolbar")) {
      const toolbar = document.createElement("div");
      toolbar.id = "vickyTransactionToolbar";
      toolbar.className = "vicky-transaction-toolbar";

      toolbar.innerHTML = `
        <div class="vicky-transaction-title">Transactions</div>

        <input
          id="vickyTransactionSearch"
          class="vicky-transaction-search"
          type="search"
          placeholder="Search transactions..."
          autocomplete="off"
        >

        <div class="vicky-transaction-filters">
          <button class="vicky-transaction-filter active" data-filter="all">
            All
          </button>
          <button class="vicky-transaction-filter" data-filter="in">
            Money In
          </button>
          <button class="vicky-transaction-filter" data-filter="out">
            Money Out
          </button>
        </div>
      `;

      transactions.parentNode.insertBefore(toolbar, transactions);

      let currentFilter = "all";

      const applyFilters = () => {
        const search =
          String(
            document.getElementById("vickyTransactionSearch")?.value || ""
          )
            .trim()
            .toLowerCase();

        transactions.querySelectorAll(".transaction").forEach((item) => {
          const text = String(item.textContent || "").toLowerCase();

          const isOut =
            /withdraw|sent|transfer.?out|debit|payment/.test(text);

          const isIn =
            /deposit|received|credit|money.?in/.test(text);

          let matchesFilter = true;

          if (currentFilter === "in") {
            matchesFilter = isIn && !isOut;
          }

          if (currentFilter === "out") {
            matchesFilter = isOut;
          }

          const matchesSearch =
            !search || text.includes(search);

          item.style.display =
            matchesFilter && matchesSearch
              ? ""
              : "none";
        });
      };

      toolbar.querySelectorAll(".vicky-transaction-filter")
        .forEach((button) => {
          button.addEventListener("click", () => {
            currentFilter = button.dataset.filter || "all";

            toolbar
              .querySelectorAll(".vicky-transaction-filter")
              .forEach((b) => b.classList.remove("active"));

            button.classList.add("active");
            applyFilters();
          });
        });

      document
        .getElementById("vickyTransactionSearch")
        ?.addEventListener("input", applyFilters);

      const observer = new MutationObserver(() => {
        transactions
          .querySelectorAll(".transaction")
          .forEach((item) => {
            const text = String(item.textContent || "").toLowerCase();

            if (
              !item.querySelector(".vicky-tx-status") &&
              text
            ) {
              let status = "completed";

              if (/pending/.test(text)) status = "pending";
              if (/processing/.test(text)) status = "processing";
              if (/failed|failure|error/.test(text)) status = "failed";
              if (/cancelled|canceled/.test(text)) status = "cancelled";

              const badge = document.createElement("span");
              badge.className = `vicky-tx-status ${status}`;
              badge.textContent = status;

              const target =
                item.querySelector("div:last-child") || item;

              target.appendChild(badge);
            }
          });

        applyFilters();
      });

      observer.observe(transactions, {
        childList: true,
        subtree: true
      });

      applyFilters();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();



function scrollToDashboard() {
  const dashboard = document.getElementById("dashboard");
  if (dashboard) dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
  setActiveBottomNav(0);
}

function scrollToTransactions() {
  const transactions = document.querySelector(".transactions-card");
  if (transactions) {
    transactions.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  setActiveBottomNav(1);
}

function setActiveBottomNav(index) {
  document.querySelectorAll(".bottom-nav-item").forEach((item, i) => {
    item.classList.toggle("active", i === index);
  });
}


// Vicky Pay authentication gate.
// Dashboard is never displayed until a valid session is restored.
document.addEventListener("DOMContentLoaded", () => {
  const token =
    localStorage.getItem("token") ||
    sessionStorage.getItem("token");

  if (!token) {
    showLoginScreen();
  }
});


document.addEventListener("DOMContentLoaded", async () => {
  const token =
    localStorage.getItem("token") ||
    sessionStorage.getItem("token");

  if (!token) {
    showLoginScreen();
    return;
  }

  /*
   * Token exists, so the existing application can restore
   * the authenticated dashboard.
   */
  showDashboardScreen();
});

/* =========================================================
   VICKY PAY — SEPARATE MONEY SCREENS
   ========================================================= */

function openMoneyScreen(screenId) {
  const dashboard = $("dashboard");

  document.querySelectorAll(".vicky-screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  if (dashboard) {
    dashboard.classList.add("hidden");
    dashboard.setAttribute("aria-hidden", "true");
  }

  const screen = $(screenId);

  if (!screen) {
    console.error("Screen not found:", screenId);
    return;
  }

  screen.classList.add("active");

  if (screenId === "transferScreen") {
    const account = getMyAccountId();
    const accountElement = $("screenAccountId");

    if (accountElement) {
      accountElement.textContent = account || "-";
    }
  }

  if (screenId === "historyScreen") {
    loadScreenTransactions();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


function closeMoneyScreen() {
  document.querySelectorAll(".vicky-screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  if (token && currentUser) {
    const dashboard = $("dashboard");

    if (dashboard) {
      dashboard.classList.remove("hidden");
      dashboard.setAttribute("aria-hidden", "false");
    }
  }
}


async function screenDeposit() {
  const amount = Number($("screenDepositAmount")?.value);
  const description =
    $("screenDepositDescription")?.value.trim() || "";

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Enter a valid deposit amount.");
    return;
  }

  try {
    const data = await apiRequest("/payments/deposit", {
      method: "POST",
      body: JSON.stringify({
        amount,
        description
      })
    });

    /*
     * Real Flutterwave deposit:
     * send the user to the secure checkout page.
     */
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
      return;
    }

    alert(data.message || "Deposit initialized.");

  } catch (error) {
    alert(error.message || "Unable to start deposit.");
  }
}


async function screenWithdraw() {
  const amount = Number($("screenWithdrawAmount")?.value);
  const description =
    $("screenWithdrawDescription")?.value.trim() || "";

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Enter a valid withdrawal amount.");
    return;
  }

  try {
    const data = await apiRequest("/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({
        amount,
        description
      })
    });

    alert(data.message || "Withdrawal successful.");

    if ($("screenWithdrawAmount")) {
      $("screenWithdrawAmount").value = "";
    }

    if ($("screenWithdrawDescription")) {
      $("screenWithdrawDescription").value = "";
    }

    await loadBalance();
    await loadTransactions();

  } catch (error) {
    alert(error.message || "Withdrawal failed.");
  }
}


async function screenFindRecipient() {
  const input = $("screenRecipientAccountId");
  const box = $("screenRecipientPreview");

  if (!input || !box) return;

  const accountId = input.value.trim().toUpperCase();

  input.value = accountId;

  if (!/^VW-[0-9]{8}$/.test(accountId)) {
    alert("Enter a valid Account ID, e.g. VW-12345678.");
    return;
  }

  if (accountId === getMyAccountId()) {
    alert("You cannot send money to your own account.");
    return;
  }

  try {
    const recipient = await apiRequest(
      `/wallet/recipient/${encodeURIComponent(accountId)}`
    );

    box.innerHTML = `
      <strong>Recipient verified ✓</strong>
      <span>${escapeHtml(recipient.full_name)}</span>
      <small>
        ${escapeHtml(recipient.account_id)}
        · ${escapeHtml(recipient.currency)}
      </small>
    `;

    box.classList.remove("hidden");

  } catch (error) {
    box.classList.add("hidden");
    box.innerHTML = "";
    alert(error.message || "Recipient not found.");
  }
}


async function screenTransfer() {
  const recipientAccountId =
    $("screenRecipientAccountId")?.value.trim().toUpperCase();

  const amount =
    Number($("screenTransferAmount")?.value);

  const description =
    $("screenTransferDescription")?.value.trim() || "";

  if (!/^VW-[0-9]{8}$/.test(recipientAccountId || "")) {
    alert("Enter a valid recipient Account ID.");
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Enter a valid transfer amount.");
    return;
  }

  try {
    const recipient = await apiRequest(
      `/wallet/recipient/${encodeURIComponent(recipientAccountId)}`
    );

    const confirmed = window.confirm(
      `Send ${amount.toFixed(2)} ${recipient.currency} to ${recipient.full_name}?`
    );

    if (!confirmed) return;

    const data = await apiRequest("/wallet/transfer", {
      method: "POST",
      body: JSON.stringify({
        recipient_account_id: recipientAccountId,
        amount,
        description
      })
    });

    alert(data.message || "Transfer successful.");

    if ($("screenRecipientAccountId")) {
      $("screenRecipientAccountId").value = "";
    }

    if ($("screenTransferAmount")) {
      $("screenTransferAmount").value = "";
    }

    if ($("screenTransferDescription")) {
      $("screenTransferDescription").value = "";
    }

    if ($("screenRecipientPreview")) {
      $("screenRecipientPreview").classList.add("hidden");
      $("screenRecipientPreview").innerHTML = "";
    }

    await loadBalance();

  } catch (error) {
    alert(error.message || "Transfer failed.");
  }
}


async function loadScreenTransactions() {
  const box = $("screenTransactions");

  if (!box) return;

  box.innerHTML =
    '<p class="empty">Loading transactions...</p>';

  try {
    const data =
      await apiRequest("/wallet/transactions?limit=50");

    const transactions = data.transactions || [];

    if (!transactions.length) {
      box.innerHTML =
        '<p class="empty">No transactions yet.</p>';
      return;
    }

    box.innerHTML = transactions.map((tx) => {
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
            ${sign}${escapeHtml(tx.amount)}
            ${escapeHtml(tx.currency)}
          </div>
        </div>
      `;
    }).join("");

  } catch (error) {
    box.innerHTML =
      `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

