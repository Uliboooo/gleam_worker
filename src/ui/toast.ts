export function showToast(message: string, action?: { label: string; onClick: () => void }, durationMs = 4000): void {
  const root = document.getElementById("toast-root")!;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const dismiss = () => {
    clearTimeout(timer);
    toast.remove();
  };

  if (action) {
    const button = document.createElement("button");
    button.className = "toast-action";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      dismiss();
      action.onClick();
    });
    toast.append(button);
  } else {
    timer = setTimeout(dismiss, durationMs);
  }

  toast.addEventListener("click", (event) => {
    if (event.target === toast) dismiss();
  });
  root.append(toast);
}
