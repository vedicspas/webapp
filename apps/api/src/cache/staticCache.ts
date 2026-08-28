import type {
  Amenity,
  BookingStatus,
  City,
  Country,
  Currency,
  PaymentMode,
  Role,
  StaticMeta,
  TreatmentCategory,
} from "@vedic/shared";
import { query } from "../db/pool.js";

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

  private byId = {
    cities: new Map<number, City>(),
    currencies: new Map<number, Currency>(),
    paymentModes: new Map<number, PaymentMode>(),
    bookingStatuses: new Map<number, BookingStatus>(),
  };

  async reload(): Promise<void> {
    const [countries, cities, amenities, categories, modes, statuses, currencies, roles] =
      await Promise.all([
        query<Country>("SELECT id, iso2, name FROM countries ORDER BY name"),
        query<City>(
          "SELECT id, country_id AS countryId, name, lat, lng FROM cities ORDER BY name"
        ),
        query<Amenity>("SELECT id, name, icon FROM amenities ORDER BY name"),
        query<TreatmentCategory>(
          "SELECT id, slug, name FROM treatment_categories ORDER BY name"
        ),
        query<PaymentMode>("SELECT id, code, name, description FROM payment_modes"),
        query<BookingStatus>("SELECT id, code, name FROM booking_statuses"),
        query<Currency>("SELECT id, code, symbol FROM currencies"),
        query<Role>("SELECT id, code FROM roles"),
      ]);

    this.countries = countries;
    this.cities = cities;
    this.amenities = amenities;
    this.treatmentCategories = categories;
    this.paymentModes = modes;
    this.bookingStatuses = statuses;
    this.currencies = currencies;
    this.roles = roles;

    this.byId.cities = new Map(cities.map((c) => [c.id, c]));
    this.byId.currencies = new Map(currencies.map((c) => [c.id, c]));
    this.byId.paymentModes = new Map(modes.map((m) => [m.id, m]));
    this.byId.bookingStatuses = new Map(statuses.map((s) => [s.id, s]));
  }

  city(id: number): City | undefined {
    return this.byId.cities.get(id);
  }

  country(id: number): Country | undefined {
    return this.countries.find((c) => c.id === id);
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
    };
  }
}

export const staticCache = new StaticCache();
