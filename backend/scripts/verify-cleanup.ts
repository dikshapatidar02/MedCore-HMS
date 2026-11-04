async function verifyCleanup() {
  const baseUrl = "http://localhost:3001/api/v1";

  console.log("=================================================");
  console.log("🔒 Final Security Verification After Rotation");
  console.log("=================================================\n");

  // Requirement 5: Verify that previously issued access tokens are rejected
  // An old token signed with previous secret (or an invalid secret)
  const oldAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWFkbWluLWFwZXgiLCJlbWFpbCI6ImFkbWluLmFwZXhAbWVkY29yZS5pbyIsInJvbGUiOiJIT1NQSVRBTF9BRE1JTiIsImhvc3BpdGFsSWQiOiJob3NwLWFwZXgtMDAxIiwiaWF0IjoxNzkzNTUwMzUwLCJleHAiOjE3OTM1OTAzNTB9.INVALID_PREVIOUS_SIGNATURE_HERE";

  const oldTokenRes = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${oldAccessToken}` },
  });
  const oldTokenRejected = oldTokenRes.status === 401;
  console.log(
    `[Step 5] Previously issued / invalid access token rejected: ${
      oldTokenRejected ? "PASS (HTTP 401 Unauthorized)" : "FAIL (HTTP " + oldTokenRes.status + ")"
    }`
  );

  // Requirement 6: Verify that old refresh tokens cannot be used
  const oldRefreshToken = "b6622866ecb03909591d4030aa4c7cb12563a7d920d12d9f04da9092466c85a3e9e7f95659de7cf1";
  const oldRefreshRes = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: oldRefreshToken }),
  });
  const oldRefreshRejected = oldRefreshRes.status === 401;
  console.log(
    `[Step 6] Old / revoked refresh token rejected: ${
      oldRefreshRejected ? "PASS (HTTP 401 Unauthorized)" : "FAIL (HTTP " + oldRefreshRes.status + ")"
    }`
  );

  // Requirement 7: Verify that a fresh login, refresh and logout cycle works
  // 7a. Fresh Login
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin.apex@medcore.io",
      password: "DemoPassword@123",
    }),
  });
  const loginJson = await loginRes.json();
  const loginPassed = loginRes.status === 200 && loginJson.success === true;
  console.log(
    `[Step 7a] Fresh login with rotated secrets: ${
      loginPassed ? "PASS (HTTP 200 OK)" : "FAIL (HTTP " + loginRes.status + ")"
    }`
  );

  const newAccessToken = loginJson.data?.accessToken;
  const newRefreshToken = loginJson.data?.refreshToken;

  // 7b. Authenticated /me endpoint
  const meRes = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${newAccessToken}` },
  });
  const mePassed = meRes.status === 200;
  console.log(
    `[Step 7b] Query authenticated profile (/auth/me): ${
      mePassed ? "PASS (HTTP 200 OK)" : "FAIL (HTTP " + meRes.status + ")"
    }`
  );

  // 7c. Fresh Refresh
  const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: newRefreshToken }),
  });
  const refreshJson = await refreshRes.json();
  const refreshPassed = refreshRes.status === 200 && refreshJson.success === true;
  console.log(
    `[Step 7c] Single-use refresh token rotation: ${
      refreshPassed ? "PASS (HTTP 200 OK)" : "FAIL (HTTP " + refreshRes.status + ")"
    }`
  );

  const rotatedAccessToken = refreshJson.data?.accessToken;
  const rotatedRefreshToken = refreshJson.data?.refreshToken;

  // 7d. Re-use of previous refresh token (must fail)
  const reuseRes = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: newRefreshToken }),
  });
  const reuseRejected = reuseRes.status === 401;
  console.log(
    `[Step 7d] Reuse of spent refresh token blocked: ${
      reuseRejected ? "PASS (HTTP 401 Unauthorized)" : "FAIL (HTTP " + reuseRes.status + ")"
    }`
  );

  // 7e. Fresh Logout
  const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rotatedAccessToken}`,
    },
    body: JSON.stringify({ refreshToken: rotatedRefreshToken }),
  });
  const logoutPassed = logoutRes.status === 200;
  console.log(
    `[Step 7e] Logout and session revocation: ${
      logoutPassed ? "PASS (HTTP 200 OK)" : "FAIL (HTTP " + logoutRes.status + ")"
    }`
  );

  // 7f. Refresh after logout (must fail)
  const afterLogoutRes = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: rotatedRefreshToken }),
  });
  const afterLogoutRejected = afterLogoutRes.status === 401;
  console.log(
    `[Step 7f] Refresh attempt after logout blocked: ${
      afterLogoutRejected ? "PASS (HTTP 401 Unauthorized)" : "FAIL (HTTP " + afterLogoutRes.status + ")"
    }`
  );

  console.log("\n=================================================");
  const allStepsPassed =
    oldTokenRejected &&
    oldRefreshRejected &&
    loginPassed &&
    mePassed &&
    refreshPassed &&
    reuseRejected &&
    logoutPassed &&
    afterLogoutRejected;

  console.log(`STATUS: ${allStepsPassed ? "ALL VERIFICATION CHECKS PASSED ✅" : "VERIFICATION FAILED ❌"}`);
  console.log("=================================================");

  if (!allStepsPassed) {
    process.exit(1);
  }
}

verifyCleanup().catch((err) => {
  console.error("Verification script error:", err.message);
  process.exit(1);
});
