/* =========================
   SAGONA – RETURNS & EXCHANGE
   Production & Backend Ready
========================= */

document.addEventListener("DOMContentLoaded", () => {
    const submitBtn = document.getElementById("submitReturn");
    if (!submitBtn) return;

    submitBtn.addEventListener("click", handleReturnRequest);
});

/* =========================
   MAIN RETURN HANDLER
========================= */

function handleReturnRequest() {
    const orderId = getValue("orderId");
    const reason = getValue("reason");

    if (!orderId) {
        alert("Please enter your Order ID.");
        return;
    }

    if (!reason) {
        alert("Please select a return reason.");
        return;
    }

    const order = findOrder(orderId);

    if (!order) {
        alert(
            "Order not found. Please check your Order ID or contact support."
        );
        return;
    }

    const returnRequest = buildReturnObject(order, reason);

    saveReturnRequest(returnRequest);

    alert(
        "Return request submitted successfully.\nOur team will contact you shortly."
    );

    console.log("Return Request:", returnRequest);
}

/* =========================
   HELPERS
========================= */

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
}

function findOrder(orderId) {
    const orders =
        JSON.parse(localStorage.getItem("previousOrders")) || [];

    return orders.find(order => order.orderId === orderId);
}

/* =========================
   RETURN OBJECT
========================= */

function buildReturnObject(order, reason) {
    return {
        returnId: `RET-${Date.now()}`,
        orderId: order.orderId,
        requestedAt: new Date().toISOString(),

        customer: order.customer || {},

        items: order.items,

        reason: reason,

        paymentMethod: order.payment?.method || "UNKNOWN",

        loyaltyImpact:
            order.payment?.method === "ONLINE"
                ? order.loyalty?.pointsEarned || 0
                : 0,

        status: "RETURN_REQUESTED"
    };
}

/* =========================
   STORAGE (TEMP – FRONTEND)
========================= */

function saveReturnRequest(returnRequest) {
    const returns =
        JSON.parse(localStorage.getItem("returnRequests")) || [];

    returns.push(returnRequest);
    localStorage.setItem("returnRequests", JSON.stringify(returns));
}

/* =========================
   FUTURE BACKEND NOTES
========================= */
/*
- Validate order ownership via backend
- Reverse loyalty points if refund approved
- Trigger payment refund API
- Email/SMS notifications
- Admin approval workflow
*/
