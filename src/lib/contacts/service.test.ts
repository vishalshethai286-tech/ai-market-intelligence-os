import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, Contact, ContactActivity, TargetCustomer, ProjectOpportunity, TenderBuyer, TenderOpportunity, VendorRegistration } =
  await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const {
  createContact,
  updateContact,
  getContactById,
  listContacts,
  changeContactStatus,
  deleteOrArchiveContact,
  addContactActivity,
  getContactActivities,
  groupContactActivitiesByDate,
  getContactStats,
  linkContactToTargetCustomer,
  linkContactToProject,
  linkContactToTenderBuyer,
  linkContactToTenderOpportunity,
  linkContactToVendorRegistration,
  listContactsForRelatedRecord,
  ContactNotFoundError,
  RelatedRecordNotFoundError,
} = await import("./service");

await dbConnect();

const TEST_PREFIX = "vitest-contacts-service-";

describe("contacts service", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Contacts Service" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contacts Service Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Contacts Service Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    await Promise.all([
      Contact.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      ContactActivity.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      TargetCustomer.deleteMany({ workspaceId }),
      ProjectOpportunity.deleteMany({ workspaceId }),
      TenderBuyer.deleteMany({ workspaceId }),
      TenderOpportunity.deleteMany({ workspaceId }),
      VendorRegistration.deleteMany({ workspaceId }),
    ]);
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("createContact creates a new contact, inferring firstName/lastName/roleCategory/seniority/companyDomain and a priority score", async () => {
    const { contact, outcome } = await createContact(workspaceId, {
      fullName: "Jane Procurement",
      companyName: "Acme Corp",
      companyWebsite: "https://www.acme-service-test.example",
      designation: "Procurement Manager",
      email: "jane.procurement@acme-service-test.example",
    });

    expect(outcome).toBe("CREATED");
    expect(contact.firstName).toBe("Jane");
    expect(contact.lastName).toBe("Procurement");
    expect(contact.roleCategory).toBe("PROCUREMENT");
    expect(contact.seniority).toBe("MANAGER");
    expect(contact.companyDomain).toBe("acme-service-test.example");
    expect(contact.priorityScore).toBeGreaterThan(0);
    expect(contact.priority).not.toBeNull();
    expect(contact.status).toBe("NEW");
    expect(contact.duplicateStatus).toBe("UNIQUE");
  });

  it("createContact updates an existing matching contact instead of creating a duplicate", async () => {
    const first = await createContact(workspaceId, { fullName: "Bob Sourcing", email: "bob.sourcing-service-test@example.com" });
    expect(first.outcome).toBe("CREATED");

    const second = await createContact(workspaceId, {
      fullName: "Bob Sourcing",
      email: "bob.sourcing-service-test@example.com",
      phoneNumber: "+1 555 300 4000",
    });
    expect(second.outcome).toBe("UPDATED_EXISTING");
    expect(second.contact.id).toBe(first.contact.id);
    expect(second.contact.phoneNumber).toBe("+1 555 300 4000");

    const count = await Contact.countDocuments({ workspaceId, email: "bob.sourcing-service-test@example.com" });
    expect(count).toBe(1);
  });

  it("updateContact updates fields and re-infers roleCategory/seniority from a new designation", async () => {
    const { contact } = await createContact(workspaceId, { fullName: "Update Target", designation: "Coordinator" });
    const updated = await updateContact(workspaceId, contact.id, { designation: "Supply Chain Director" });
    expect(updated.designation).toBe("Supply Chain Director");
    expect(updated.roleCategory).toBe("SUPPLY_CHAIN");
    expect(updated.seniority).toBe("DIRECTOR");
  });

  it("updateContact respects an explicit roleCategory/seniority override over inference", async () => {
    const { contact } = await createContact(workspaceId, { fullName: "Override Target" });
    const updated = await updateContact(workspaceId, contact.id, { designation: "Procurement Manager", roleCategory: "OTHER", seniority: "UNKNOWN" });
    expect(updated.roleCategory).toBe("OTHER");
    expect(updated.seniority).toBe("UNKNOWN");
  });

  it("updateContact throws ContactNotFoundError for an id from another workspace", async () => {
    const { contact } = await createContact(otherWorkspaceId, { fullName: "Other Workspace Contact" });
    await expect(updateContact(workspaceId, contact.id, { notes: "x" })).rejects.toThrow(ContactNotFoundError);
  });

  it("getContactById is ownership-checked", async () => {
    const { contact } = await createContact(workspaceId, { fullName: "Gettable Contact" });
    const found = await getContactById(workspaceId, contact.id);
    expect(found.fullName).toBe("Gettable Contact");

    const otherContact = await createContact(otherWorkspaceId, { fullName: "Other Gettable" });
    await expect(getContactById(workspaceId, otherContact.contact.id)).rejects.toThrow(ContactNotFoundError);
  });

  it("listContacts filters by roleCategory/country/priority/status and searches by name/company/email/designation", async () => {
    await createContact(workspaceId, { fullName: "List Test Procurement", country: "Germany", designation: "Procurement Officer", companyName: "List Test Co" });

    const byRole = await listContacts(workspaceId, { roleCategory: "PROCUREMENT" });
    expect(byRole.total).toBeGreaterThanOrEqual(1);
    expect(byRole.contacts.every((c) => c.roleCategory === "PROCUREMENT")).toBe(true);

    const byCountry = await listContacts(workspaceId, { country: "Germany" });
    expect(byCountry.contacts.some((c) => c.fullName === "List Test Procurement")).toBe(true);

    const bySearch = await listContacts(workspaceId, { q: "List Test Co" });
    expect(bySearch.contacts.some((c) => c.companyName === "List Test Co")).toBe(true);
  });

  it("listContacts paginates and never returns another workspace's contacts", async () => {
    await createContact(otherWorkspaceId, { fullName: "Isolation Check Contact" });
    const result = await listContacts(workspaceId, { q: "Isolation Check Contact" });
    expect(result.total).toBe(0);
  });

  it("changeContactStatus updates status and logs a STATUS_CHANGE activity", async () => {
    const { contact } = await createContact(workspaceId, { fullName: "Status Change Target" });
    const updated = await changeContactStatus(workspaceId, contact.id, "CONTACTED");
    expect(updated.status).toBe("CONTACTED");

    const activities = await getContactActivities(workspaceId, contact.id);
    expect(activities.some((a) => a.activityType === "STATUS_CHANGE")).toBe(true);
  });

  it("deleteOrArchiveContact archives (never hard-deletes) the contact", async () => {
    const { contact } = await createContact(workspaceId, { fullName: "Archive Target" });
    await deleteOrArchiveContact(workspaceId, contact.id);
    const stillExists = await Contact.findById(contact.id);
    expect(stillExists).not.toBeNull();
    expect(stillExists?.status).toBe("ARCHIVED");
  });

  it("addContactActivity logs an activity and updates lastContactedAt for a Call/Email/Meeting/Follow Up", async () => {
    const { contact } = await createContact(workspaceId, { fullName: "Activity Target" });
    const activity = await addContactActivity(workspaceId, contact.id, { activityType: "CALL", description: "Discussed pricing" });
    expect(activity.activityType).toBe("CALL");

    const updated = await getContactById(workspaceId, contact.id);
    expect(updated.lastContactedAt).not.toBeNull();
  });

  it("addContactActivity throws ContactNotFoundError for an id from another workspace", async () => {
    const { contact } = await createContact(otherWorkspaceId, { fullName: "Other Activity Target" });
    await expect(addContactActivity(workspaceId, contact.id, { activityType: "NOTE" })).rejects.toThrow(ContactNotFoundError);
  });

  it("logs a Call activity with a CONNECTED outcome", async () => {
    const { contact } = await createContact(workspaceId, { fullName: "Call Log Target" });
    const activity = await addContactActivity(workspaceId, contact.id, { activityType: "CALL", outcome: "CONNECTED", description: "Reached the contact directly." });
    expect(activity.activityType).toBe("CALL");
    expect(activity.outcome).toBe("CONNECTED");
  });

  it("logs an Email activity with an EMAIL_SENT outcome", async () => {
    const { contact } = await createContact(workspaceId, { fullName: "Email Log Target" });
    const activity = await addContactActivity(workspaceId, contact.id, { activityType: "EMAIL", outcome: "EMAIL_SENT" });
    expect(activity.activityType).toBe("EMAIL");
    expect(activity.outcome).toBe("EMAIL_SENT");
  });

  it("adding a Follow Up activity with a nextFollowUpAt sets it on the contact and flips recommendedAction to FOLLOW_UP once due", async () => {
    const { contact } = await createContact(workspaceId, { fullName: "Follow Up Target", email: "followup@example.com", phoneNumber: "+1 555 222 3333" });
    const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await addContactActivity(workspaceId, contact.id, { activityType: "FOLLOW_UP", outcome: "FOLLOW_UP_REQUIRED", nextFollowUpAt: pastDue });

    const updated = await getContactById(workspaceId, contact.id);
    expect(updated.nextFollowUpAt).not.toBeNull();
    expect(updated.recommendedAction).toBe("FOLLOW_UP");
  });

  it("groupContactActivitiesByDate groups activities by calendar day and preserves newest-first ordering within a day", async () => {
    const { contact } = await createContact(workspaceId, { fullName: "Timeline Target" });
    await addContactActivity(workspaceId, contact.id, { activityType: "NOTE", title: "First note" });
    await addContactActivity(workspaceId, contact.id, { activityType: "NOTE", title: "Second note" });

    const activities = await getContactActivities(workspaceId, contact.id);
    const groups = groupContactActivitiesByDate(activities);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups[0].activities[0].title).toBe("Second note");
  });

  it("getContactStats aggregates totals/byRoleCategory/byCountry/needingFollowUp/withoutEmail/linked counts", async () => {
    const stats = await getContactStats(workspaceId);
    expect(stats.total).toBeGreaterThan(0);
    expect(typeof stats.byRoleCategory).toBe("object");
  });

  it("linkContactToTargetCustomer links and improves score when the related record is approved", async () => {
    const customer = await TargetCustomer.create({
      workspaceId,
      customerName: "Link Test Customer",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "APPROVED",
    });
    const { contact } = await createContact(workspaceId, { fullName: "Link Test Contact A" });
    const before = contact.priorityScore;

    const linked = await linkContactToTargetCustomer(workspaceId, contact.id, customer.id);
    expect(linked.relatedTargetCustomerId).toBe(customer.id);
    expect(linked.priorityScore).toBeGreaterThanOrEqual(before);

    const related = await listContactsForRelatedRecord(workspaceId, "TARGET_CUSTOMER", customer.id);
    expect(related.some((c) => c.id === contact.id)).toBe(true);
  });

  it("linkContactToProject links successfully", async () => {
    const project = await ProjectOpportunity.create({
      workspaceId,
      clientName: "Link Test Client",
      projectName: "Link Test Project",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    const { contact } = await createContact(workspaceId, { fullName: "Link Test Contact B" });
    const linked = await linkContactToProject(workspaceId, contact.id, project.id);
    expect(linked.relatedProjectOpportunityId).toBe(project.id);
  });

  it("linkContactToTenderBuyer links successfully", async () => {
    const buyer = await TenderBuyer.create({
      workspaceId,
      customerName: "Link Test Buyer",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    const { contact } = await createContact(workspaceId, { fullName: "Link Test Contact C" });
    const linked = await linkContactToTenderBuyer(workspaceId, contact.id, buyer.id);
    expect(linked.relatedTenderBuyerId).toBe(buyer.id);
  });

  it("linkContactToTenderOpportunity links successfully", async () => {
    const opportunity = await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Link Test Authority",
      tenderTitle: "Link Test Tender",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    const { contact } = await createContact(workspaceId, { fullName: "Link Test Contact D" });
    const linked = await linkContactToTenderOpportunity(workspaceId, contact.id, opportunity.id);
    expect(linked.relatedTenderOpportunityId).toBe(opportunity.id);
  });

  it("linkContactToVendorRegistration links successfully", async () => {
    const registration = await VendorRegistration.create({
      workspaceId,
      customerName: "Link Test Vendor",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    const { contact } = await createContact(workspaceId, { fullName: "Link Test Contact E" });
    const linked = await linkContactToVendorRegistration(workspaceId, contact.id, registration.id);
    expect(linked.relatedVendorRegistrationId).toBe(registration.id);
  });

  it("linking throws RelatedRecordNotFoundError when the related record doesn't exist in this workspace", async () => {
    const { contact } = await createContact(workspaceId, { fullName: "Bad Link Contact" });
    await expect(linkContactToTargetCustomer(workspaceId, contact.id, "nonexistent-id")).rejects.toThrow(RelatedRecordNotFoundError);
  });

  it("linking is workspace-isolated — cannot link a contact to a record from another workspace", async () => {
    const otherCustomer = await TargetCustomer.create({
      workspaceId: otherWorkspaceId,
      customerName: "Cross Workspace Link Customer",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    const { contact } = await createContact(workspaceId, { fullName: "Cross Workspace Link Contact" });
    await expect(linkContactToTargetCustomer(workspaceId, contact.id, otherCustomer.id)).rejects.toThrow(RelatedRecordNotFoundError);
  });
});
