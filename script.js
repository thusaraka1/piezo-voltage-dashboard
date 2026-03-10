document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chartCanvas = document.getElementById('voltageChart');
    const currentVoltageEl = document.getElementById('currentVoltage');
    const totalVoltageEl = document.getElementById('totalVoltage');
    const connectionDot = document.getElementById('connectionDot');
    const connectionStatus = document.getElementById('connectionStatus');
    const footerStatusText = document.getElementById('footerStatusText');
    const espIpInput = document.getElementById('espIpInput');
    const updateIpBtn = document.getElementById('updateIpBtn');
    const toggleSimBtn = document.getElementById('toggleSimBtn');

    // State Variables
    let espIp = espIpInput.value;
    let isSimulationMode = true;
    let fetchInterval = null;
    let fallbackToSimTimeout = null;
    let totalGeneratedVoltage = 0; // For simulation

    // Chart Configuration
    const maxDataPoints = 30;

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
                            return `${context.parsed.y.toFixed(2)} V`;
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
                            return value + ' V';
                        }
                    },
                    suggestedMin: 0,
                    suggestedMax: 50
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
            footerStatusText.textContent = `Attempting to connect to ${espIp}...`;
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

        voltageChart.update('none'); // Update without animation for smooth flow
    }

    // Animate value transition
    function animateValue(element, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);

            // Ease out quad
            const easeProgress = progress * (2 - progress);
            const currentObj = start + easeProgress * (end - start);

            element.textContent = currentObj.toFixed(2);

            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                element.textContent = end.toFixed(2);
            }
        };
        window.requestAnimationFrame(step);
    }

    // Process new data
    function processData(currentVolts, totalVolts) {
        const oldCurrent = parseFloat(currentVoltageEl.textContent) || 0;
        const oldTotal = parseFloat(totalVoltageEl.textContent) || 0;

        animateValue(currentVoltageEl, oldCurrent, currentVolts, 500);
        animateValue(totalVoltageEl, oldTotal, totalVolts, 500);

        updateChart(currentVolts);
    }

    // Fetch data from ESP32
    async function fetchEspData() {
        if (isSimulationMode) return;

        try {
            // Assume the ESP32 hosts a simple JSON endpoint at /data
            // Format expected: {"voltage": 12.4, "totalVoltage": 45.2}

            // Add a timeout to the fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const response = await fetch(`http://${espIp}/data`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // If we successfully get data, clear any pending fallback and set connected
            clearTimeout(fallbackToSimTimeout);
            setConnectionStatus('connected');

            // Allow flexibility in field names
            const v = data.voltage || data.v || data.value || 0;
            const tv = data.totalVoltage || data.total || data.tv || data.sum || 0;

            processData(v, tv);

        } catch (error) {
            console.error('Error fetching ESP32 data:', error);
            setConnectionStatus('disconnected');

            // After 5 consecutive failures, maybe prompt to simulate?
            // For now, leave it disconnected. The user can manually click 'Toggle Simulation'
        }
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

        totalGeneratedVoltage += simVolts * 0.01; // Just a dummy increment

        processData(simVolts, totalGeneratedVoltage);
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
            fetchInterval = setInterval(fetchEspData, 2000);
            fetchEspData(); // Initial call
        }
    }

    // Event Listeners
    updateIpBtn.addEventListener('click', () => {
        const newIp = espIpInput.value.trim();
        if (newIp) {
            espIp = newIp;
            isSimulationMode = false;
            toggleSimBtn.classList.remove('active');

            // Reset fields
            currentVoltageEl.textContent = '0.00';
            totalVoltageEl.textContent = '0.00';

            voltageChart.data.labels = Array(maxDataPoints).fill('');
            voltageChart.data.datasets[0].data = Array(maxDataPoints).fill(null);
            voltageChart.update();

            startDataStream();
        }
    });

    toggleSimBtn.addEventListener('click', () => {
        isSimulationMode = !isSimulationMode;

        if (isSimulationMode) {
            toggleSimBtn.classList.add('active');
        } else {
            toggleSimBtn.classList.remove('active');
        }

        startDataStream();
    });

    // Handle user pressing enter in IP input
    espIpInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            updateIpBtn.click();
        }
    });

    // Initialize
    if (isSimulationMode) {
        toggleSimBtn.classList.add('active');
    }

    // Wait briefly before attempting first connection to show loading state nicely
    setTimeout(startDataStream, 1000);
});
