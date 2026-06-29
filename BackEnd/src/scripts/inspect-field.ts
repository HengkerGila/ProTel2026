/**
 * Read-Only Inspection Script untuk mengecek lahan "coba test lokal"
 * Menampilkan rincian lahan, sub-block, dan 3 data input sensor terakhir.
 */
import 'dotenv/config';
import { eq, desc } from 'drizzle-orm';
import { db, testConnection } from '@/db/client';
import { 
  fields, subBlocks, telemetryRecords, subBlockCurrentStates
} from '@/db/schema';

async function inspectField() {
  console.log('\n🔍 Memeriksa koneksi ke Database PostgreSQL...');
  await testConnection();

  console.log('\n====================================================================');
  console.log('📍 LAPORAN INSPEKSI LAHAN: "coba test lokal"');
  console.log('====================================================================\n');

  try {
    const allFields = await db.select().from(fields);
    const targetField = allFields.find(f => f.name.toLowerCase().includes('coba test lokal'));

    if (!targetField) {
      console.log('❌ Lahan dengan nama "coba test lokal" tidak ditemukan di database.');
      console.log('\nDaftar seluruh lahan yang ada di database saat ini:');
      allFields.forEach(f => console.log(` 🔹 [ID: ${f.id}] -> "${f.name}"`));
      process.exit(0);
    }

    console.log(`🌾 Nama Lahan      : "${targetField.name}"`);
    console.log(`🔑 ID Lahan        : ${targetField.id}`);
    console.log(`💧 Sumber Air      : ${targetField.waterSourceType || 'Tidak diketahui'}`);
    console.log(`👨‍🌾 Default Operator: ${targetField.operatorCountDefault || 1} orang\n`);

    const fieldSubBlocks = await db.select().from(subBlocks).where(eq(subBlocks.fieldId, targetField.id));

    console.log(`📊 Total Sub-Block : ${fieldSubBlocks.length} petak sawah`);
    console.log('--------------------------------------------------------------------');

    for (let i = 0; i < fieldSubBlocks.length; i++) {
      const sb = fieldSubBlocks[i];
      console.log(`\n🧩 Petak #${i + 1} | Kode: "${sb.code || 'Tanpa Kode'}" | ID: ${sb.id}`);
      console.log(`   Luas: ${sb.areaM2 || 0} m² | Elevasi: ${sb.elevationM || 0} m`);

      // Cek current state
      const [currentState] = await db.select().from(subBlockCurrentStates)
        .where(eq(subBlockCurrentStates.subBlockId, sb.id))
        .limit(1);

      if (currentState) {
        console.log(`   🌊 Status Terkini (Agregasi Sistem): ${currentState.waterLevelCm ?? 'N/A'} cm (${currentState.stateSource} | ${currentState.freshnessStatus})`);
        console.log(`      Observasi Terakhir: ${currentState.lastObservationAt ? new Date(currentState.lastObservationAt).toLocaleString('id-ID') : 'Belum pernah'}`);
      } else {
        console.log(`   🌊 Status Terkini: Belum ada agregasi status di database`);
      }

      // Cek 3 data sensor mentah terakhir
      const recentTelemetry = await db.select({
        timestamp: telemetryRecords.eventTimestamp,
        waterLevel: telemetryRecords.waterLevelCm,
        temp: telemetryRecords.temperatureC,
        hum: telemetryRecords.humidityPct,
        deviceCode: telemetryRecords.deviceCode,
      })
      .from(telemetryRecords)
      .where(eq(telemetryRecords.subBlockId, sb.id))
      .orderBy(desc(telemetryRecords.eventTimestamp))
      .limit(3);

      console.log(`   📡 3 Input Telemetry Sensor Terakhir:`);
      if (recentTelemetry.length === 0) {
        console.log(`      (Belum ada riwayat data sensor untuk petak ini)`);
      } else {
        recentTelemetry.forEach((t, idx) => {
          const timeStr = t.timestamp ? new Date(t.timestamp).toLocaleString('id-ID') : 'N/A';
          console.log(`      [${idx + 1}] Waktu: ${timeStr} | Device: ${t.deviceCode} | Muka Air: ${t.waterLevel ?? 'N/A'} cm | Suhu: ${t.temp ?? 'N/A'}°C`);
        });
      }
      console.log('--------------------------------------------------------------------');
    }

    console.log('\n✅ Inspeksi read-only selesai. Tidak ada perubahan data yang dilakukan.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal melakukan inspeksi:', err);
    process.exit(1);
  }
}

inspectField();
