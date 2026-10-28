import type {
  Amenity,
  BookingStatus,
  City,
  Country,
  Currency,
  MedicalCondition,
  MedicalConditionCategory,
  NamedLookup,
  PaymentMode,
  Role,
  SiteSettings,
  StaticMeta,
  TreatmentCategory,
} from "@vedic/shared";
import { query } from "../db/pool.js";
import { turnstileSiteKey } from "../lib/turnstile.js";

/**
 * Static lookup tables, loaded once at startup and kept as plain arrays in
 * process memory. These tables change rarely (admin-only); call reload()
 * after editing them.
 */
class StaticCache {
  countries: Country[] = [];
  cities: City[] = [];
  amenities: Amenity[] = [];
  treatmentCategories: TreatmentCategory[] = [];
  paymentModes: PaymentMode[] = [];
  bookingStatuses: BookingStatus[] = [];
  currencies: Currency[] = [];
  roles: Role[] = [];
  languages: NamedLookup[] = [];
  dietaryOptions: NamedLookup[] = [];
  accommodationTypes: NamedLookup[] = [];
  medicalConditionCategories: MedicalConditionCategory[] = [];
  medicalConditions: MedicalCondition[] = [];
  siteSettings: SiteSettings = { contactEmail: null, contactPhone: null };

  private byId = {
    countries: new Map<number, Country>(),
    cities: new Map<number, City>(),
    currencies: new Map<number, Currency>(),
    paymentModes: new Map<number, PaymentMode>(),
    bookingStatuses: new Map<number, BookingStatus>(),
    treatmentCategories: new Map<number, TreatmentCategory>(),
    medicalConditionsByName: new Map<string, MedicalCondition>(),
  };

  async reload(): Promise<void> {
    const [
      countries,
      cities,
      amenities,
      categories,
      modes,
      statuses,
      currencies,
      roles,
      languages,
      dietaryOptions,
      accommodationTypes,
      medicalConditionCategories,
      medicalConditions,
    ] = await Promise.all([
      query<Country>("SELECT id, iso2, name FROM countries ORDER BY name"),
      query<City>(
        "SELECT id, country_id AS countryId, name, lat, lng FROM cities ORDER BY name"
      ),
      query<Amenity>("SELECT id, name, icon FROM amenities ORDER BY name"),
      query<TreatmentCategory>(
        "SELECT id, slug, name FROM treatment_categories ORDER BY name"
      ),
      query<PaymentMode & { requires_online_payment?: number }>(
        `SELECT id, code, name, description,
           requires_online_payment AS requiresOnlinePayment
         FROM payment_modes`
      ),
      query<BookingStatus>("SELECT id, code, name FROM booking_statuses"),
      query<Currency>("SELECT id, code, symbol FROM currencies"),
      query<Role>("SELECT id, code FROM roles"),
      query<NamedLookup>("SELECT id, name FROM languages ORDER BY name").catch(() => []),
      query<NamedLookup>("SELECT id, name FROM dietary_options ORDER BY name").catch(() => []),
      query<NamedLookup>("SELECT id, name FROM accommodation_types ORDER BY name").catch(() => []),
      query<MedicalConditionCategory>(
        `SELECT id, name, sort_order AS sortOrder
         FROM medical_condition_categories
         WHERE is_deleted = 0
         ORDER BY sort_order, name`
      ).catch(() => []),
      query<MedicalCondition>(
        `SELECT mc.id, mc.category_id AS categoryId, mc.name
         FROM medical_conditions mc
         JOIN medical_condition_categories c ON c.id = mc.category_id
         WHERE mc.is_deleted = 0 AND c.is_deleted = 0
         ORDER BY mc.name`
      ).catch(() => []),
    ]);

    this.countries = countries;
    this.cities = cities;
    this.amenities = amenities;
    this.treatmentCategories = [...categories].sort((a, b) => {
      if (a.slug === "other") return 1;
      if (b.slug === "other") return -1;
      return a.name.localeCompare(b.name);
    });
    this.paymentModes = modes.map((m) => ({
      ...m,
      requiresOnlinePayment: Boolean(m.requiresOnlinePayment),
    }));
    this.bookingStatuses = statuses;
    this.currencies = currencies;
    this.roles = roles;
    this.languages = languages;
    this.dietaryOptions = dietaryOptions;
    this.accommodationTypes = accommodationTypes;
    this.medicalConditionCategories = medicalConditionCategories;
    this.medicalConditions = medicalConditions;
    await this.reloadSiteSettings();

    this.byId.countries = new Map(countries.map((c) => [c.id, c]));
    this.byId.cities = new Map(cities.map((c) => [c.id, c]));
    this.byId.currencies = new Map(currencies.map((c) => [c.id, c]));
    this.byId.paymentModes = new Map(modes.map((m) => [m.id, m]));
    this.byId.bookingStatuses = new Map(statuses.map((s) => [s.id, s]));
    this.byId.treatmentCategories = new Map(this.treatmentCategories.map((c) => [c.id, c]));
    this.byId.medicalConditionsByName = new Map(
      medicalConditions.map((c) => [c.name.toLowerCase(), c])
    );
  }

  medicalConditionByName(name: string): MedicalCondition | undefined {
    return this.byId.medicalConditionsByName.get(name.trim().toLowerCase());
  }

  treatmentCategory(id: number): TreatmentCategory | undefined {
    return this.byId.treatmentCategories.get(id);
  }

  treatmentCategoryName(id: number): string {
    return this.treatmentCategory(id)?.name ?? "Other";
  }

  city(id: number): City | undefined {
    return this.byId.cities.get(id);
  }

  country(id: number): Country | undefined {
    return this.byId.countries.get(id);
  }

  currency(id: number): Currency | undefined {
    return this.byId.currencies.get(id);
  }

  paymentMode(id: number): PaymentMode | undefined {
    return this.byId.paymentModes.get(id);
  }

  paymentModeByCode(code: string): PaymentMode | undefined {
    return this.paymentModes.find((m) => m.code === code);
  }

  bookingStatus(id: number): BookingStatus | undefined {
    return this.byId.bookingStatuses.get(id);
  }

  bookingStatusByCode(code: string): BookingStatus | undefined {
    return this.bookingStatuses.find((s) => s.code === code);
  }

  roleByCode(code: string): Role | undefined {
    return this.roles.find((r) => r.code === code);
  }

  /** Reloads only `site_settings` so contact details stay current after admin save. */
  async reloadSiteSettings(): Promise<void> {
    const rows = await query<{ setting_key: string; setting_value: string | null }>(
      "SELECT setting_key, setting_value FROM site_settings"
    ).catch(() => []);
    const map = new Map(rows.map((r) => [r.setting_key, (r.setting_value ?? "").trim()]));
    const email = map.get("contact_email") || null;
    const phone = map.get("contact_phone") || null;
    this.siteSettings = { contactEmail: email, contactPhone: phone };
  }

  /**
   * Resolves a role by code, reloading lookup tables if the cache was empty
   * (e.g. the API started before `db:seed`). Throws a clear error if the role
   * still does not exist.
   */
  async requireRole(code: string): Promise<Role> {
    let role = this.roleByCode(code);
    if (!role) {
      await this.reload();
      role = this.roleByCode(code);
    }
    if (!role) {
      throw new Error(
        `Missing role "${code}". Seed the database and restart the API.`
      );
    }
    return role;
  }

  toMeta(): StaticMeta {
    return {
      countries: this.countries,
      cities: this.cities,
      amenities: this.amenities,
      treatmentCategories: this.treatmentCategories,
      paymentModes: this.paymentModes,
      bookingStatuses: this.bookingStatuses,
      currencies: this.currencies,
      roles: this.roles,
      languages: this.languages,
      dietaryOptions: this.dietaryOptions,
      accommodationTypes: this.accommodationTypes,
      medicalConditionCategories: this.medicalConditionCategories,
      medicalConditions: this.medicalConditions,
      turnstileSiteKey: turnstileSiteKey(),
    };
  }
}

export const staticCache = new StaticCache();
