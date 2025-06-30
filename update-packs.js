const db = require('./config/database');

async function updatePackDescriptions() {
    try {
        // Update the starter pack description
        await db.execute(
            `UPDATE packs SET description = ? WHERE id = 1`,
            ['Get started with 300 points - sessions cost just 1 point each']
        );
        
        // Update pricing to use DH if not already done
        await db.execute(
            `UPDATE packs SET price = REPLACE(price, '$', '') WHERE price LIKE '$%'`
        );
        
        console.log('✅ Updated pack descriptions and pricing');
        
        // Show current packs
        const [packs] = await db.execute('SELECT * FROM packs ORDER BY id');
        console.log('\n📦 Current Packs:');
        packs.forEach(pack => {
            console.log(`- ${pack.name}: ${pack.points} points, ${pack.price ? pack.price + ' DH' : 'Free'}`);
            console.log(`  Description: ${pack.description}`);
        });
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

updatePackDescriptions();
