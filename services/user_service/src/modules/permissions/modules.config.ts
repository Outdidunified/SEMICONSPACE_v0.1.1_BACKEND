// permission.constants.ts
export const MODULES = [
  {
    module: "dashboard",
    submodules: [
      { name: "view_dashboard", actions: ["view"] }
    ]
  },
  {
    module: "catalogue_management",
    submodules: [
      { name: "manage_manufacturers", actions: ["create", "view", "update", "delete"] },
      { name: "manage_categories", actions: ["create", "view", "update", "delete"] },
      { name: "manage_products", actions: ["create", "view", "update", "delete"] },
    ]
  },
  {
    module: "user_management",
    submodules: [
      { name: "manage_roles", actions: ["create", "view", "update", "delete"] },
      { name: "manage_users", actions: ["create", "view", "update", "delete"] },
    ]
  },
  {
    module: "order_management",
    submodules: [
      { name: "manage_orders", actions: ["create", "view", "update", "delete"] }
    ]
  },
  {
    module: "profile",
    submodules: [
      { name: "account_settings", actions: ["update", "view"] }
    ]
  }
];
