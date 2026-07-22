// src/utils/testQuery.js
import { getSupabaseClient } from './supabaseClient.js';
import { getSettings, getTagConfigs } from './db.js';

async function test() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error("Supabase not initialized");
    return;
  }
  const settings = await getSettings();
  const tableName = settings.selectedTable || 'Database';
  const mappings = settings.columnMappings || {};
  const tagCol = mappings.tagCol || 'TagIndex';

  const tagConfigs = await getTagConfigs();
  const tagIdx = tagConfigs[0]?.TagIndex || 0;

  console.log("Testing tagCol:", tagCol);
  console.log("Testing tagIdx:", tagIdx);
  console.log("Testing tableName:", tableName);

  // Test .in
  const targetIndexes = [tagIdx, String(tagIdx).trim()];
  const str = String(tagIdx).trim();
  if (/^\d+$/.test(str)) {
    targetIndexes.push(`T${str}`);
    targetIndexes.push(`t${str}`);
  } else if (/^[Tt](\d+)$/.test(str)) {
    const digits = str.substring(1);
    targetIndexes.push(digits);
    targetIndexes.push(parseInt(digits, 10));
  }
  const uniqueIndexes = [...new Set(targetIndexes)].filter(Boolean);
  console.log("uniqueIndexes:", uniqueIndexes);

  const { data: dataIn, error: errorIn } = await supabase
    .from(tableName)
    .select('*')
    .in(tagCol, uniqueIndexes)
    .limit(3);

  console.log("Result of .in query:");
  if (errorIn) {
    console.error("Error with .in:", errorIn.message, errorIn);
  } else {
    console.log("Data count:", dataIn?.length, dataIn);
  }

  // Test .or
  let orFilter = `TagIndex.eq.${tagIdx}`;
  const numberVal = parseInt(str.replace(/[^\d]/g, ''), 10);
  if (!isNaN(numberVal)) {
    orFilter = `TagIndex.eq.${tagIdx},TagIndex.eq.T${numberVal},TagIndex.eq.${numberVal}`;
  }
  console.log("orFilter:", orFilter);
  const { data: dataOr, error: errorOr } = await supabase
    .from(tableName)
    .select('*')
    .or(orFilter)
    .limit(3);

  console.log("Result of .or query:");
  if (errorOr) {
    console.error("Error with .or:", errorOr.message, errorOr);
  } else {
    console.log("Data count:", dataOr?.length, dataOr);
  }
}

test();
