import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function check() {
  if (
    !process.env.SUPABASE_URL ||
    !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  )
    throw new Error(
      "Completa SUPABASE_URL y SUPABASE_SECRET_KEY en .env y guarda el archivo.",
    );
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    },
  );
  const records = await client.from("sm_records").select("kind").limit(1);
  if (records.error)
    throw new Error(
      "No se pudo leer sm_records. Verifica las credenciales y ejecuta la migración SQL en Supabase.",
    );
  const rpc = await client.rpc("sm_commit", { p_changes: [], p_event: null });
  if (rpc.error || rpc.data !== "committed")
    throw new Error(
      "Falta la función sm_commit o la clave no tiene permisos de servidor.",
    );
  const bucket = await client.storage.getBucket(
    process.env.SUPABASE_STORAGE_BUCKET || "souvenir-assets",
  );
  if (bucket.error || !bucket.data)
    throw new Error(
      "No se encontró el depósito privado de imágenes. Ejecuta la migración SQL.",
    );
  if (bucket.data.public)
    throw new Error("El depósito de imágenes debe ser privado.");
  console.log(
    "Supabase verificado: datos, transacciones y depósito privado disponibles. No se crearon diseños ni se mostraron claves.",
  );
}
check().catch(() => {
  console.error(
    "No se pudo verificar Supabase. Comprueba SUPABASE_URL, la Secret key y la migración SQL. Las claves no se muestran.",
  );
  process.exitCode = 1;
});
