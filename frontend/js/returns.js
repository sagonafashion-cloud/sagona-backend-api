document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("submitReturn")
        ?.addEventListener("click", submit);
});

function submit() {
    const orderId = val("orderId");
    const reason = val("reason");

    if (!orderId) return alert("Enter Order ID");
    if (!reason) return alert("Select reason");

    const orders = JSON.parse(localStorage.getItem("previousOrders")) || [];
    const order = orders.find(o => o.orderId === orderId);

    if (!order) return alert("Order not found");

    const request = {
        id: `RET-${Date.now()}`,
        orderId,
        reason,
        date: new Date().toISOString(),
        status: "REQUESTED"
    };

    const list = JSON.parse(localStorage.getItem("returnRequests")) || [];
    list.push(request);
    localStorage.setItem("returnRequests", JSON.stringify(list));

    alert("Return request submitted");
}

const val = (id) => document.getElementById(id)?.value.trim();