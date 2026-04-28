// Mock data for the LAS Weekend Duty Dashboard
// Weekend of May 1–3, 2026

const WEEKEND = {
  label: "Weekend of May 1–3, 2026",
  short: "May 1–3, 2026",
  friday: "Fri 1 May",
  saturday: "Sat 2 May",
  sunday: "Sun 3 May",
};

const HC_STUDENTS = [
  { id: 1, initials: "M.B.", dorm: "Belle Époque", reason: "Migraine — overnight obs.", since: "Thu 22:40", status: "overnight" },
  { id: 2, initials: "L.K.", dorm: "Savoy", reason: "Sprained ankle, PT review", since: "Fri 09:15", status: "in" },
  { id: 3, initials: "T.A.", dorm: "Hadsom", reason: "Fever 38.4°", since: "Fri 11:02", status: "in" },
  { id: 4, initials: "S.R.", dorm: "Fairmont", reason: "Post-procedure rest", since: "Fri 13:30", status: "in" },
];

const NO_PA_STUDENTS = [
  { id: 5, initials: "J.D.", dorm: "Belle Époque", restriction: "No contact sports", until: "Mon 4 May" },
  { id: 6, initials: "C.V.", dorm: "Savoy", restriction: "No skiing / high altitude", until: "End of term" },
  { id: 7, initials: "P.M.", dorm: "North", restriction: "Cleared walking only", until: "Wed 6 May" },
];

const TRAVEL_REQUESTS = [
  { id: 8, initials: "A.S.", dorm: "Belle Époque", destination: "Geneva", depart: "Fri 16:00", return: "Sun 19:00", status: "approved", chaperone: "Family" },
  { id: 9, initials: "N.O.", dorm: "Savoy", destination: "Lausanne — orthodontist", depart: "Sat 09:30", return: "Sat 14:00", status: "approved", chaperone: "Self" },
  { id: 10, initials: "K.W.", dorm: "Fairmont", destination: "Zürich Airport", depart: "Sun 06:00", return: "—", status: "approved", chaperone: "Driver" },
  { id: 11, initials: "R.E.", dorm: "Hadsom", destination: "Montreux", depart: "Sat 11:00", return: "Sat 22:00", status: "pending", chaperone: "Host family" },
  { id: 12, initials: "Y.T.", dorm: "North", destination: "Bern", depart: "Sat 08:00", return: "Sun 17:00", status: "pending", chaperone: "Family" },
  { id: 13, initials: "I.P.", dorm: "Belle Époque", destination: "Visp — train", depart: "Fri 17:30", return: "Sun 18:00", status: "approved", chaperone: "Family" },
  { id: 14, initials: "B.G.", dorm: "Savoy", destination: "Vevey", depart: "Sat 10:00", return: "Sat 18:00", status: "approved", chaperone: "Host family" },
  { id: 15, initials: "F.A.", dorm: "Fairmont", destination: "Aigle — appointment", depart: "Sat 13:00", return: "Sat 17:00", status: "approved", chaperone: "Self" },
];

const SCHEDULED_TRIPS = [
  { id: "t1", title: "Mountain bike — Col du Pillon", lead: "Mr. Hoffman", count: 14, depart: "Sat 08:30", return: "Sat 16:00" },
  { id: "t2", title: "Lavaux vineyard hike", lead: "Mme. Berger", count: 9, depart: "Sat 09:00", return: "Sat 15:30" },
  { id: "t3", title: "Cinéma Capitole — Lausanne", lead: "Ms. Okafor", count: 22, depart: "Sat 18:00", return: "Sat 23:00" },
  { id: "t4", title: "Sunday brunch — Aigle", lead: "Mr. Tanaka", count: 7, depart: "Sun 10:00", return: "Sun 13:30" },
];

const INITIAL_RESOURCES = [
  { id: "commendation-list", name: "Commendation List", url: "#", icon: "award", category: "Reference", addedBy: "system" },
  { id: "saturday-catchup", name: "Saturday Catch-up", url: "#", icon: "book", category: "Reference", addedBy: "system" },
  { id: "duty-team", name: "Duty Team Roster", url: "#", icon: "users", category: "Logistics", addedBy: "system" },
  { id: "transport", name: "Weekend Transport Sheet", url: "#", icon: "bus", category: "Logistics", addedBy: "system" },
  { id: "clipboard", name: "Clipboard", url: "#", icon: "clipboard", category: "Discipline & Accountability", addedBy: "system" },
  { id: "incident-log", name: "Incident Log", url: "#", icon: "flag", category: "Discipline & Accountability", addedBy: "system" },
  { id: "hc-handover", name: "HC Handover Notes", url: "#", icon: "heart", category: "Health & Wellbeing", addedBy: "system" },
  { id: "duty-whatsapp", name: "Duty WhatsApp", url: "#", icon: "message", category: "Communications", addedBy: "system" },
  { id: "parent-contacts", name: "Parent Contacts", url: "#", icon: "phone", category: "Communications", addedBy: "system" },
  { id: "activity-signup", name: "Activity Sign-up", url: "#", icon: "calendar", category: "Activities", addedBy: "system" },
];

const CATEGORIES = [
  "Reference",
  "Logistics",
  "Health & Wellbeing",
  "Discipline & Accountability",
  "Communications",
  "Activities",
  "Admin",
];

const ICON_OPTIONS = [
  "link", "book", "award", "users", "bus", "clipboard", "flag", "heart",
  "message", "phone", "calendar", "folder", "map", "key", "bell"
];

window.MOCK = { WEEKEND, HC_STUDENTS, NO_PA_STUDENTS, TRAVEL_REQUESTS, SCHEDULED_TRIPS, INITIAL_RESOURCES, CATEGORIES, ICON_OPTIONS };
