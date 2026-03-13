// Firebase Test Script to simulate ESP32
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA7z7EDnoC3ah7vgo5QtavDHbKVEkljwDU",
    authDomain: "shawishwa-c8795.firebaseapp.com",
    databaseURL: "https://shawishwa-c8795-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "shawishwa-c8795",
    storageBucket: "shawishwa-c8795.firebasestorage.app",
    messagingSenderId: "672875113522",
    appId: "1:672875113522:web:3363092599e9c92534602b",
    measurementId: "G-JRF44SSZ7Q"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

async function runTest() {
    console.log("Starting Firebase Test Script...");
    const piezoRef = ref(database, 'piezo');

    let peakVolt = 0;
    let totalVolt = 0;
    let genTime = 0;

    console.log("Simulating 5 successful hits to Firebase...");

    for (let i = 1; i <= 5; i++) {
        const curVolt = (Math.random() * 50).toFixed(3);

        if (parseFloat(curVolt) > peakVolt) {
            peakVolt = parseFloat(curVolt);
        }

        totalVolt += parseFloat(curVolt);
        genTime += 150; // 150ms per hit

        const data = {
            currentVoltage: parseFloat(curVolt),
            peakVoltage: parseFloat(peakVolt.toFixed(3)),
            totalGeneratedVoltage: parseFloat(totalVolt.toFixed(3)),
            generatedTime: genTime
        };

        try {
            await set(piezoRef, data);
            console.log(`[Hit ${i}/5] Successfully pushed data to Firebase:`, data);
        } catch (error) {
            console.error(`[Hit ${i}/5] Error pushing to Firebase:`, error);
        }

        // Wait 2 seconds before the next push
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Set voltage back to 0 at the end
    const finalData = {
        currentVoltage: 0.0,
        peakVoltage: parseFloat(peakVolt.toFixed(3)),
        totalGeneratedVoltage: parseFloat(totalVolt.toFixed(3)),
        generatedTime: genTime
    };

    await set(piezoRef, finalData);
    console.log("Test finished! Final data set to 0.0V:", finalData);
    process.exit(0);
}

runTest();
