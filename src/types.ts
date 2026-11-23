import { CityID, CountryID, AdminID } from "./ontology";

export interface Guess {
  country: string;
  state_province: string;
  city: string;
  features: string[];
}

export interface GroundTruth {
  filename: string;
  country_id: CountryID | null;
  admin_id: AdminID | null;
  city_id: CityID | null;
}

export interface ModelScore {
  guess: Guess;
  points: number;
  breakdown: { country: boolean; state_province: boolean; city: boolean };
  unresolved_fields?: string[];
}
