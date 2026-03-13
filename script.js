

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chartCanvas = document.getElementById('voltageChart');
    const currentVoltageEl = document.getElementById('currentVoltage');
    const peakVoltageEl = document.getElementById('peakVoltage');
    const totalVoltageEl = document.getElementById('totalVoltage');
    const generatedTimeEl = document.getElementById('generatedTime');
    const connectionDot = document.getElementById('connectionDot');
    const connectionStatus = document.getElementById('connectionStatus');
    const footerStatusText = document.getElementById('footerStatusText');
    const espIpInput = document.getElementById('espIpInput');
    const updateIpBtn = document.getElementById('updateIpBtn');
    const toggleSimBtn = document.getElementById('toggleSimBtn');

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
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // State Variables
    let isSimulationMode = false; // Default to live Firebase mode
    let fetchInterval = null;
    let fallbackToSimTimeout = null;
    let totalGeneratedVoltage = 0; // For simulation
    let peakVoltage = 0;
    let generatedTime = 0;

    // Chart Configuration
    const maxDataPoints = 30;

    function getDynamicScale(values) {
        const validValues = values.filter((value) => Number.isFinite(value));

        if (validValues.length === 0) {
            return { min: 0, max: 1 };
        }

        const minVal = Math.min(...validValues);
        const maxVal = Math.max(...validValues);

        if (maxVal === minVal) {
            const baseline = Math.max(Math.abs(maxVal) * 0.2, 0.1);
            return {
                min: Math.max(0, minVal - baseline),
                max: maxVal + baseline
            };
        }

        const range = maxVal - minVal;
        const padding = Math.max(range * 0.2, 0.05);

        return {
            min: Math.max(0, minVal - padding),
            max: maxVal + padding
        };
    }

    // Gradient for chart area
    const ctx = chartCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 350);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)'); // Accent color
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    const chartConfig = {
        type: 'line',
        data: {
            labels: Array(maxDataPoints).fill(''),
            datasets: [{
                label: 'Voltage (V)',
                data: Array(maxDataPoints).fill(null),
                borderColor: '#6366F1', // Accent color
                backgroundColor: gradient,
                borderWidth: 2,
                pointBackgroundColor: '#10B981', // Success color
                pointBorderColor: '#ffffff',
                pointHoverBackgroundColor: '#ffffff',
                pointHoverBorderColor: '#10B981',
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(11, 10, 16, 0.8)',
                    titleColor: '#A0A5B5',
                    bodyColor: '#FFFFFF',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: function (context) {
                            return `${context.parsed.y.toFixed(3)} V`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        display: false
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#A0A5B5',
                        font: {
                            family: "'Inter', sans-serif"
                        },
                        callback: function (value) {
                            return Number(value).toFixed(value < 1 ? 3 : 2) + ' V';
                        }
                    },
                    min: 0,
                    max: 1
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    };

    const voltageChart = new Chart(ctx, chartConfig);

    // Update UI elements based on status
    function setConnectionStatus(status, message) {
        connectionDot.className = 'dot';
        footerStatusText.className = '';
        const espIp = (espIpInput?.value || '').trim() || 'ESP32';

        if (status === 'connected') {
            connectionDot.classList.add('connected');
            connectionStatus.textContent = isSimulationMode ? 'Simulating' : 'Live';
            connectionStatus.style.color = 'var(--text-secondary)';
            footerStatusText.textContent = isSimulationMode ? 'Running in simulation mode' : `Receiving data from ${espIp}`;
            footerStatusText.classList.add('status-success');
        } else if (status === 'disconnected') {
            connectionDot.classList.add('disconnected');
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.style.color = 'var(--error-color)';
            footerStatusText.textContent = message || `Failed to fetch data from ESP32 (${espIp})`;
            footerStatusText.classList.add('status-error');
        } else {
            // Connecting
            connectionStatus.textContent = 'Connecting...';
            connectionStatus.style.color = 'var(--warning-color)';
            footerStatusText.textContent = `Attempting to connect to Live Database...`;
        }
    }

    // Add new data point to Chart
    function updateChart(voltage) {
        const timeOffset = new Date().toLocaleTimeString();

        voltageChart.data.labels.push(timeOffset);
        voltageChart.data.datasets[0].data.push(voltage);

        // Remove oldest data point if exceeding max
        if (voltageChart.data.labels.length > maxDataPoints) {
            voltageChart.data.labels.shift();
            voltageChart.data.datasets[0].data.shift();
        }

        const { min, max } = getDynamicScale(voltageChart.data.datasets[0].data);
        voltageChart.options.scales.y.min = min;
        voltageChart.options.scales.y.max = max;

        voltageChart.update('none'); // Update without animation for smooth flow
    }

    // Animate value transition
    function animateValue(element, start, end, duration, decimals = 3) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);

            // Ease out quad
            const easeProgress = progress * (2 - progress);
            const currentObj = start + easeProgress * (end - start);

            element.textContent = currentObj.toFixed(decimals);

            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                element.textContent = end.toFixed(decimals);
            }
        };
        window.requestAnimationFrame(step);
    }

    // Process new data
    function processData(currentVolts, totalVolts, gTime) {
        const oldCurrent = parseFloat(currentVoltageEl.textContent) || 0;
        const oldPeak = parseFloat(peakVoltageEl.textContent) || 0;
        const oldTotal = parseFloat(totalVoltageEl.textContent) || 0;
        const oldTime = parseFloat(generatedTimeEl.textContent) || 0;

        if (currentVolts > peakVoltage) {
            peakVoltage = currentVolts;
        }

        animateValue(currentVoltageEl, oldCurrent, currentVolts, 500, 3);
        animateValue(peakVoltageEl, oldPeak, peakVoltage, 500, 3);
        animateValue(totalVoltageEl, oldTotal, totalVolts, 500, 3);
        animateValue(generatedTimeEl, oldTime, gTime, 500, 0);

        updateChart(currentVolts);
    }

    // Fetch data from Firebase Realtime Database
    function setupFirebaseListeners() {
        if (isSimulationMode) return;

        setConnectionStatus('connecting');

        const piezoRef = database.ref('piezo');

        piezoRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();

                setConnectionStatus('connected');

                const v = parseFloat(data.currentVoltage) || 0;
                const tv = parseFloat(data.totalGeneratedVoltage) || 0;

                // Allow peak voltage to be received from DB or calculated locally as fallback
                const dbPeak = parseFloat(data.peakVoltage) || 0;
                if (dbPeak > peakVoltage) {
                    peakVoltage = dbPeak;
                }

                const gt = parseFloat(data.generatedTime) || generatedTime;

                processData(v, tv, gt);
            } else {
                setConnectionStatus('disconnected', 'No Data Found in Database');
            }
        }, (error) => {
            console.error('Error fetching Firebase data:', error);
            setConnectionStatus('disconnected', 'Database Connection Error');
        });
    }

    // Generate Simulation Data
    function generateSimulationData() {
        if (!isSimulationMode) return;

        setConnectionStatus('connected');

        let simVolts = 0;

        // 40% chance of a footstep happening
        if (Math.random() > 0.6) {
            // Simulate piezoelectric series cell voltage from footsteps (fluctuating around 35V)
            const time = Date.now() / 800; // Step frequency loosely
            const baseVoltage = 35.0;
            const noise = (Math.random() - 0.5) * 8.0; // Higher fluctuation spikes
            const sineWave = Math.sin(time) * 4.0;

            simVolts = baseVoltage + sineWave + noise;

            // Ensure some positive bounds
            simVolts = Math.max(0, simVolts);
        }

        if (simVolts > 0) {
            generatedTime += 1000; // Increment time by 1s (1000ms) for simulation polling interval
        }
        totalGeneratedVoltage += simVolts * 0.01; // Just a dummy increment

        processData(simVolts, totalGeneratedVoltage, generatedTime);
    }

    // Start data polling
    function startDataStream() {
        if (fetchInterval) clearInterval(fetchInterval);

        setConnectionStatus('connecting');

        if (isSimulationMode) {
            fetchInterval = setInterval(generateSimulationData, 1000);
            generateSimulationData(); // Initial call
        } else {
            // Start real fetching
            setupFirebaseListeners();
        }
    }

    // Event Listeners
    // Hide unused IP config row in index.html (or just let it remain inactive if desired)
    // Actually, we can just comment out the event listeners as it's not used in Firebase mode.
    espIpInput.parentElement.style.display = 'none';

    // Initialize
    if (isSimulationMode) {
        toggleSimBtn.classList.add('active');
    }

    // Wait briefly before attempting first connection to show loading state nicely
    setTimeout(startDataStream, 1000);
});
