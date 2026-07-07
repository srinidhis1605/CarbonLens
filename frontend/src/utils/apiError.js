export function getApiErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  const apiError = err?.response?.data?.error;
  const apiMessage = err?.response?.data?.message;

  if (apiError === "User not found") {
    return "No account found with this email. Register first or check your email.";
  }

  if (apiError === "Invalid password") {
    return "Incorrect password. Please try again.";
  }

  if (apiError === "Registration failed.") {
    return "Registration failed. This email may already be in use.";
  }

  return apiMessage || apiError || err?.message || fallback;
}
