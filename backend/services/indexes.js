const mongoose = require("mongoose");

async function prepareIndexes() {
  const database = mongoose.connection.db;
  const [tenantCollection] = await database.listCollections({ name: "tenants" }).toArray();

  if (tenantCollection) {
    const collection = database.collection("tenants");
    const [count, indexes] = await Promise.all([collection.countDocuments({}), collection.indexes()]);
    const obsolete = indexes.filter((index) => index.unique && ["user_1", "phone_1"].includes(index.name));

    if (obsolete.length && count > 0) {
      throw new Error("The old unique tenant indexes require a data migration before shared tenant accounts can be enabled");
    }
    for (const index of obsolete) await collection.dropIndex(index.name);
  }

  await mongoose.syncIndexes();
}

module.exports = { prepareIndexes };
