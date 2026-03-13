/*
  ESP32 Piezoelectric Voltage Monitor (Firebase Edition)
  ------------------------------------------------------
  Sends data to Firebase Realtime Database when voltage is generated.

  Hardware:
  Piezo plates -> Bridge Rectifier -> Capacitor -> Voltage Divider -> GPIO34

  Before uploading:
  1. Install "Firebase ESP32 Client" library by Mobizt in Arduino Library Manager
  2. Install "Arduino_JSON" library
  3. Change the WIFI_SSID and WIFI_PASSWORD!
*/

#include <WiFi.h>
#include <Firebase_ESP_Client.h>

// Provide the token generation process info.
#include "addons/TokenHelper.h"
// Provide the RTDB payload printing info and other helper functions.
#include "addons/RTDBHelper.h"

// ==============================
// 1. INPUT YOUR WIFI SETTINGS
// ==============================
#define WIFI_SSID "YOUR_WIFI_NAME_HERE"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD_HERE"

// ==============================
// 2. FIREBASE DETAILS
// ==============================
#define API_KEY "AIzaSyA7z7EDnoC3ah7vgo5QtavDHbKVEkljwDU"
#define DATABASE_URL "https://shawishwa-c8795-default-rtdb.asia-southeast1.firebasedatabase.app/"

// Define Firebase objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

bool signupOK = false;

// ==============================
// HARDWARE SETTINGS
// ==============================
const int piezoPin = 34;
const float adcRef = 3.3;
const int adcMax = 4095;

// Voltage divider ratio
const float dividerRatio = 2.0;

// Sampling settings
const int numSamples = 50;
const int sampleDelayMs = 5;

// Threshold to detect actual generation
const float voltageThreshold = 0.05;   // 50 mV

// Variables
float currentVoltage = 0.0;
float peakVoltage = 0.0;
float totalGeneratedVoltage = 0.0;
unsigned long readingCount = 0;

// Event timing
bool generatingNow = false;
unsigned long generationStartTime = 0;
unsigned long generationDuration = 0;

float readAverageVoltage(int samples) {
  long totalRaw = 0;

  for (int i = 0; i < samples; i++) {
    totalRaw += analogRead(piezoPin);
    delay(sampleDelayMs);
  }

  float avgRaw = (float)totalRaw / samples;
  float measuredVoltage = (avgRaw / adcMax) * adcRef;
  float actualVoltage = measuredVoltage * dividerRatio;

  return actualVoltage;
}

void printHeader() {
  Serial.println("====================================================");
  Serial.println("     ESP32 PIEZO FIREBASE UPLOADER INITIALIZED      ");
  Serial.println("====================================================");
  Serial.print("ADC Pin            : GPIO");
  Serial.println(piezoPin);
  Serial.print("Voltage Threshold  : ");
  Serial.print(voltageThreshold, 3);
  Serial.println(" V");
  Serial.println("====================================================");
}


void initWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi ..");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print('.');
    delay(1000);
  }
  Serial.println();
  Serial.print("Connected! IP Address: ");
  Serial.println(WiFi.localIP());
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  delay(1000);
  
  // 1. Connect to WiFi
  initWiFi();

  // Give WiFi more time to stabilize
  delay(1000);

  // Sync time to fix SSL/TLS handshake errors with Firebase
  configTime(3 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Syncing time");
  time_t now = time(nullptr);
  while (now < 24 * 3600) {
    Serial.print(".");
    delay(100);
    now = time(nullptr);
  }
  Serial.println("\nTime synchronized.");

  // 2. Configure Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  // Since we don't have a Root CA passed, let's bypass strict cert verification for testing
  config.cert.data = NULL; // Ignore SSL certificate validation (insecure)

  // In Test Mode, we can use the API key to authenticate simple access,
  // or sign in as User. We'll sign up anonymously as before, but since it implies Email Auth is required,
  // Let's use the simplest approach for RTDB Test Mode: No Auth required
  Serial.println("Using NoAuth for Test Mode Database...");
  config.signer.test_mode = true;
  signupOK = true;



  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  currentVoltage = readAverageVoltage(numSamples);

  // Check whether generation is happening
  if (currentVoltage > voltageThreshold) {

    // Generation just started
    if (!generatingNow) {
      generatingNow = true;
      generationStartTime = millis();

      Serial.println();
      Serial.println(">>> GENERATION STARTED <<<");
    }

    // Update duration
    generationDuration = millis() - generationStartTime;

    // Update peak voltage
    if (currentVoltage > peakVoltage) {
      peakVoltage = currentVoltage;
    }

    // Update running total
    totalGeneratedVoltage += currentVoltage;
    readingCount++;
    
    // UPLOAD TO FIREBASE ONLY IF READY
    if (Firebase.ready() && signupOK) {
        
        // Use multi-path update or individual paths. We will use individual for simplicity/robustness.
        // It updates nodes inside the "piezo" branch in Realtime DB.
        Firebase.RTDB.setFloat(&fbdo, "piezo/currentVoltage", currentVoltage);
        Firebase.RTDB.setFloat(&fbdo, "piezo/peakVoltage", peakVoltage);
        Firebase.RTDB.setFloat(&fbdo, "piezo/totalGeneratedVoltage", totalGeneratedVoltage);
        Firebase.RTDB.setFloat(&fbdo, "piezo/generatedTime", generationDuration);
        
        Serial.print("Firebase Update -> V: ");
        Serial.print(currentVoltage, 3);
        Serial.print(" | Peak: ");
        Serial.print(peakVoltage, 3);
        Serial.print(" | Total: ");
        Serial.println(totalGeneratedVoltage, 3);
    } else {
        Serial.println("Warning: Firebase not ready!");
    }

  }
  else {
    // Generation just ended
    // If voltage drops to 0, let's also send 0 to Firebase for currentVoltage
    if (generatingNow) {
      generatingNow = false;

      // Send 0 for current voltage when stopping, keep others same.
      if (Firebase.ready() && signupOK) {
          Firebase.RTDB.setFloat(&fbdo, "piezo/currentVoltage", 0.0);
      }

      Serial.println(">>> GENERATION ENDED <<<");
      Serial.print("Final Event Duration   : ");
      Serial.print(generationDuration);
      Serial.println(" ms");
      Serial.println("====================================================");
    }
  }

  delay(200); // Wait between reads to avoid overwhelming ESP32 and Firebase
}
