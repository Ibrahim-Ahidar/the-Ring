addEventListener("load", () => {
  for (const el of document.querySelectorAll("#main *")) {
    if (el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
      el.scrollTop = el.scrollHeight;
    }
  }
});
