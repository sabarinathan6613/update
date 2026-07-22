import { getTagConfigs } from './src/utils/db.js';

async function run() {
  try {
    const configs = await getTagConfigs({ forceRefresh: true });
    console.log(`Total tagConfigs returned by getTagConfigs: ${configs.length}`);
    const sampleTags = configs.filter(t => t.SampleDatalog || t.sample_datalog_enabled);
    console.log(`Sample Station tags count: ${sampleTags.length}`);
    sampleTags.forEach(t => {
      console.log(`- Index: ${t.TagIndex}, Name: ${t.TagName}, ActiveStatus: ${t.ActiveStatus}, sample_datalog_enabled: ${t.sample_datalog_enabled}, SampleDatalog: ${t.SampleDatalog}`);
    });
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
