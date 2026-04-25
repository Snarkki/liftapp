export function getCsrfToken(): string {
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("csrftoken="));

  return cookie ? decodeURIComponent(cookie.split("=")[1] ?? "") : "";
}
