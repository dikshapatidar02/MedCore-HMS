/**
 * MedCore HMS — Enterprise Branding & Tenant Sanitization Utilities
 *
 * Ensures consistent enterprise-grade presentation across the dashboard,
 * top navigation bar, sidebar, and user profile while preserving multi-tenant
 * data isolation and backend data structures.
 */

/**
 * Sanitizes hospital display names by stripping out unnecessary visible "demo" wording
 * while preserving authentic institution names.
 *
 * Examples:
 * - "MedCore Demo Hospital" -> "MedCore Hospital"
 * - "Apex Multispecialty Hospital" -> "Apex Multispecialty Hospital"
 * - "" / undefined / null -> "MedCore Hospital"
 */
export function cleanHospitalName(name?: string | null): string {
  if (!name || !name.trim()) {
    return "MedCore Hospital";
  }

  const cleaned = name
    .replace(/\bDemo\s*/gi, "")
    .replace(/\s*Demo\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "MedCore Hospital";
}

/**
 * Sanitizes hospital organization codes for presentation in enterprise UI.
 *
 * Examples:
 * - "DEMO-MAIN" -> "MC-MAIN"
 * - "DEMO-001" -> "MC-001"
 * - "APEX-MAIN" -> "APEX-MAIN"
 * - "" / undefined / null -> "MC-MAIN"
 */
export function cleanHospitalCode(code?: string | null): string {
  if (!code || !code.trim()) {
    return "MC-MAIN";
  }

  const upper = code.trim().toUpperCase();
  if (upper === "DEMO-MAIN" || upper === "DEMO") {
    return "MC-MAIN";
  }

  const cleaned = code
    .replace(/\bDEMO-?/gi, "MC-")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "MC-MAIN";
}

