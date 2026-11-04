import { UserRole } from "@prisma/client";

export enum Resource {
  HOSPITAL = "HOSPITAL",
  DEPARTMENT = "DEPARTMENT",
  ROOM = "ROOM",
  USER = "USER",
  DOCTOR = "DOCTOR",
  PATIENT = "PATIENT",
  APPOINTMENT = "APPOINTMENT",
  MEDICAL_RECORD = "MEDICAL_RECORD",
  PRESCRIPTION = "PRESCRIPTION",
  MEDICINE = "MEDICINE",
  LAB_ORDER = "LAB_ORDER",
  LAB_TEST = "LAB_TEST",
  LAB_RESULT = "LAB_RESULT",
  INVOICE = "INVOICE",
  PAYMENT = "PAYMENT",
  AUDIT_LOG = "AUDIT_LOG",
  NOTIFICATION = "NOTIFICATION",
}

export enum Action {
  CREATE = "CREATE",
  READ = "READ",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  MANAGE = "MANAGE",
}

export interface Permission {
  resource: Resource;
  actions: Action[];
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: [
    { resource: Resource.HOSPITAL, actions: [Action.MANAGE, Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
    { resource: Resource.DEPARTMENT, actions: [Action.MANAGE, Action.READ] },
    { resource: Resource.USER, actions: [Action.MANAGE, Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
    { resource: Resource.AUDIT_LOG, actions: [Action.READ] },
    { resource: Resource.NOTIFICATION, actions: [Action.CREATE, Action.READ] },
  ],
  [UserRole.HOSPITAL_ADMIN]: [
    { resource: Resource.HOSPITAL, actions: [Action.READ, Action.UPDATE] },
    { resource: Resource.DEPARTMENT, actions: [Action.MANAGE, Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
    { resource: Resource.ROOM, actions: [Action.MANAGE, Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
    { resource: Resource.USER, actions: [Action.CREATE, Action.READ, Action.UPDATE] },
    { resource: Resource.DOCTOR, actions: [Action.MANAGE, Action.CREATE, Action.READ, Action.UPDATE] },
    { resource: Resource.PATIENT, actions: [Action.READ] },
    { resource: Resource.APPOINTMENT, actions: [Action.READ, Action.UPDATE] },
    { resource: Resource.INVOICE, actions: [Action.READ] },
    { resource: Resource.AUDIT_LOG, actions: [Action.READ] },
    { resource: Resource.NOTIFICATION, actions: [Action.CREATE, Action.READ] },
  ],
  [UserRole.DOCTOR]: [
    { resource: Resource.DOCTOR, actions: [Action.READ, Action.UPDATE] },
    { resource: Resource.PATIENT, actions: [Action.READ] },
    { resource: Resource.APPOINTMENT, actions: [Action.READ, Action.UPDATE] },
    { resource: Resource.MEDICAL_RECORD, actions: [Action.CREATE, Action.READ, Action.UPDATE] },
    { resource: Resource.PRESCRIPTION, actions: [Action.CREATE, Action.READ, Action.UPDATE] },
    { resource: Resource.MEDICINE, actions: [Action.READ] },
    { resource: Resource.LAB_ORDER, actions: [Action.CREATE, Action.READ] },
    { resource: Resource.LAB_RESULT, actions: [Action.READ] },
    { resource: Resource.NOTIFICATION, actions: [Action.READ] },
  ],
  [UserRole.NURSE]: [
    { resource: Resource.PATIENT, actions: [Action.READ] },
    { resource: Resource.APPOINTMENT, actions: [Action.READ] },
    { resource: Resource.MEDICAL_RECORD, actions: [Action.READ, Action.UPDATE] }, // Update vitals
    { resource: Resource.ROOM, actions: [Action.READ, Action.UPDATE] },
    { resource: Resource.LAB_ORDER, actions: [Action.READ, Action.UPDATE] }, // Update sample collection
    { resource: Resource.NOTIFICATION, actions: [Action.READ] },
  ],
  [UserRole.RECEPTIONIST]: [
    { resource: Resource.PATIENT, actions: [Action.CREATE, Action.READ, Action.UPDATE] },
    { resource: Resource.APPOINTMENT, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
    { resource: Resource.DOCTOR, actions: [Action.READ] },
    { resource: Resource.DEPARTMENT, actions: [Action.READ] },
    { resource: Resource.ROOM, actions: [Action.READ] },
    { resource: Resource.NOTIFICATION, actions: [Action.READ] },
  ],
  [UserRole.LAB_TECHNICIAN]: [
    { resource: Resource.LAB_ORDER, actions: [Action.READ, Action.UPDATE] },
    { resource: Resource.LAB_RESULT, actions: [Action.CREATE, Action.READ, Action.UPDATE] },
    { resource: Resource.LAB_TEST, actions: [Action.READ] },
    { resource: Resource.PATIENT, actions: [Action.READ] },
    { resource: Resource.NOTIFICATION, actions: [Action.READ] },
  ],
  [UserRole.PHARMACIST]: [
    { resource: Resource.PRESCRIPTION, actions: [Action.READ, Action.UPDATE] }, // Dispense
    { resource: Resource.MEDICINE, actions: [Action.MANAGE, Action.CREATE, Action.READ, Action.UPDATE] },
    { resource: Resource.PATIENT, actions: [Action.READ] },
    { resource: Resource.NOTIFICATION, actions: [Action.READ] },
  ],
  [UserRole.ACCOUNTANT]: [
    { resource: Resource.INVOICE, actions: [Action.CREATE, Action.READ, Action.UPDATE] },
    { resource: Resource.PAYMENT, actions: [Action.CREATE, Action.READ, Action.UPDATE] },
    { resource: Resource.PATIENT, actions: [Action.READ] },
    { resource: Resource.APPOINTMENT, actions: [Action.READ] },
    { resource: Resource.NOTIFICATION, actions: [Action.READ] },
  ],
  [UserRole.PATIENT]: [
    { resource: Resource.PATIENT, actions: [Action.READ] }, // Own profile only
    { resource: Resource.APPOINTMENT, actions: [Action.CREATE, Action.READ, Action.UPDATE] }, // Own appointments only
    { resource: Resource.MEDICAL_RECORD, actions: [Action.READ] }, // Own medical records only
    { resource: Resource.PRESCRIPTION, actions: [Action.READ] }, // Own prescriptions only
    { resource: Resource.LAB_RESULT, actions: [Action.READ] }, // Own lab results only
    { resource: Resource.INVOICE, actions: [Action.READ] }, // Own invoices only
    { resource: Resource.NOTIFICATION, actions: [Action.READ] }, // Own notifications only
  ],
};

export function hasPermission(role: UserRole, resource: Resource, action: Action): boolean {
  if (role === UserRole.SUPER_ADMIN) return true;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.some(
    (p) =>
      p.resource === resource &&
      (p.actions.includes(action) || p.actions.includes(Action.MANAGE))
  );
}
