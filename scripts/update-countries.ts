// One-time script to update holiday_country for all users based on preferred name mapping
// Run with: npx tsx scripts/update-countries.ts

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const nameCountryMap: Record<string, string> = {
  Mara: "PH", Sam: "IT", Jess: "IT", Jamie: "PH", Sab: "PH", Neil: "PH",
  Yna: "PH", Marcella: "IT", Ciara: "PH", Anya: "PH", Mickey: "PH",
  Klang: "PH", Lorna: "IT", Frances: "PH", Alecx: "PH", Jessi: "PH",
  DeniseF: "PH", Weng: "PH", Benz: "PH", Ina: "PH", Roman: "PH",
  Driton: "XK", Japheth: "PH", Dannah: "PH", Benedict: "PH", Flandra: "XK",
  Vito: "PH", Joshua: "PH", Khristian: "PH", Mishy: "PH", Andrea: "IT",
  Bleron: "XK", RC: "PH", Reign: "PH", Antigona: "XK", Pat: "PH",
  BeaT: "PH", BB: "PH", Andrrim: "XK", Gentrit: "XK", Chriss: "PH",
  Jeff: "PH", Lawrence: "PH", Jerome: "PH", Ally: "PH", Haris: "XK",
  Nushe: "XK", Cayla: "PH", Mica: "PH", Pebby: "PH", Mozes: "IT",
  SamS: "PH", GioT: "PH", Julia: "PH", Klara: "XK", Qendresa: "XK",
  Brad: "PH", Charles: "PH", Rapha: "PH", Karen: "PH", FluturaI: "XK",
  BleronL: "XK", StevenJ: "PH", Yosh: "PH", "Inés": "IT", Bo: "PH",
  Ton: "PH", Jhan: "PH", Gica: "PH", Aira: "PH", Althea: "PH",
  Justin: "PH", Jovana: "IT", Marigona: "XK", Matt: "PH", Ricxel: "PH",
  DaveS: "PH", EJ: "PH", Jewel: "PH", Dafina: "XK", Elita: "XK",
  Adriana: "XK", Nikki: "PH", Kobs: "PH", Kenji: "PH", MiggyG: "PH",
  Isaiah: "PH", Met: "XK", Eriola: "XK", Eljesa: "XK", Dion: "XK",
  Mila: "PH", Mary: "PH", Kamille: "PH", Asha: "PH", Darrell: "PH",
  Soleil: "PH", Aby: "PH", Dwayne: "PH", Nikolle: "PH", Bardha: "XK",
  Shawn: "PH", Nicko: "PH", Eena: "PH", Arlinda: "XK", Flakron: "XK",
  Semra: "XK", Rineta: "XK", YllkaQ: "XK", Verina: "XK", Chayee: "PH",
  Cedric: "PH", Damon: "PH", Argil: "PH", Audrey: "PH", Zai: "PH",
  Nabeen: "PH", Maxine: "PH", Carmen: "PH", Allen: "PH", AntonP: "PH",
  Chay: "PH", Beatrize: "PH", Angellie: "PH", AntonioV: "IT", Janne: "PH",
  Aima: "PH", Adri: "PH", Clyde: "PH", NicoleS: "PH", Otero: "AE",
  Sherby: "PH", Ivy: "PH", Joelea: "PH", Rein: "PH", Joaquin: "PH",
};

async function main() {
  const { data: users, error } = await supabase.from("users").select("id, full_name, holiday_country");
  if (error) { console.error("Failed to fetch users:", error); return; }

  let updated = 0;
  let notFound: string[] = [];

  for (const [prefName, country] of Object.entries(nameCountryMap)) {
    // Match by: full_name starts with preferred name, or full_name contains it
    const match = users?.find((u) => {
      const name = u.full_name.toLowerCase();
      const pref = prefName.toLowerCase();
      return name === pref || name.startsWith(pref + " ") || name.startsWith(pref);
    });

    if (match) {
      if (match.holiday_country !== country) {
        const { error: updateErr } = await supabase
          .from("users")
          .update({ holiday_country: country })
          .eq("id", match.id);
        if (updateErr) {
          console.error(`Failed to update ${match.full_name}:`, updateErr.message);
        } else {
          console.log(`Updated ${match.full_name}: ${match.holiday_country} -> ${country}`);
          updated++;
        }
      }
    } else {
      notFound.push(prefName);
    }
  }

  console.log(`\nDone. Updated: ${updated}, Not found: ${notFound.length}`);
  if (notFound.length > 0) {
    console.log("Unmatched names:", notFound.join(", "));
  }
}

main();
