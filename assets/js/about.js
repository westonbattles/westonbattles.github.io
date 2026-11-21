(() => {
  const ageElement = document.getElementById("about-age");
  if (!ageElement) return;

  function updateAge() {
    const today = new Date();
    let age = today.getFullYear() - 2005;
    if (today.getMonth() < 2 || (today.getMonth() === 2 && today.getDate() < 28)) age--;
    ageElement.textContent = `${age}-year-old `;
  }

  updateAge();
  // Refresh after midnight and when a visitor returns to an open tab.
  function scheduleUpdate() {
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    setTimeout(() => { updateAge(); scheduleUpdate(); }, tomorrow - new Date() + 50);
  }
  scheduleUpdate();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateAge();
  });
})();
