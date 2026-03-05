// ============================================================
// charts.js - Chart.js Visualization
// ============================================================

let angleChart = null;
let allSessions = [];
let chartFilter = 'all';

//Creates the chart for the angle history
export function renderAngleChart(sessions, filter = 'all') {
    const canvas = document.getElementById('angleChart');
    if (!canvas) {
        console.error('Chart canvas not found');
        return;
    }

    // Store sessions and filter
    allSessions = sessions;
    chartFilter = filter;

    // Toggle STS progress note visibility depending on filter
    try {
        const stsNote = document.getElementById('sts-progress-note');
        if (stsNote) stsNote.style.display = (filter === 'sit-to-stand') ? 'inline-block' : 'none';
    } catch (e) { /* ignore in non-browser env */ }

    // Destroy existing chart
    if (angleChart) {
        angleChart.destroy();
        angleChart = null;
    }

    // If filter is 'all' (initial load), show an empty chart prompting user to pick a filter
    if (filter === 'all') {
        renderEmptyChart(canvas, 'none');
        return;
    }

    // Apply filter
    let filteredSessions = sessions;
    if (filter === 'all') {
        // Exclude sit-to-stand from the combined shoulder-angle chart
        filteredSessions = sessions.filter(s => s.exercise_name !== 'sit-to-stand');
    } else {
        filteredSessions = sessions.filter(s => s.exercise_name === filter);
    }

    // Handle empty dataset
    if (!filteredSessions || filteredSessions.length === 0) {
        renderEmptyChart(canvas, filter);
        return;
    }

    // Sort chronologically (oldest first)
    const sortedSessions = filteredSessions.slice().reverse();

    // Extract data
    const labels = sortedSessions.map(s => {
        const date = new Date(s.timestamp);
        let exerciseName = 'AR';
        if (s.exercise_name === 'overhead-hold') exerciseName = 'OH';
        else if (s.exercise_name === 'sit-to-stand') exerciseName = 'STS';
        return date.toLocaleDateString() + '\n' +
            date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
            ' [' + exerciseName + ']';
    });

    const leftMaxData = sortedSessions.map(s => s.left_max);
    const rightMaxData = sortedSessions.map(s => s.right_max);

    // Helper: try parse duration into seconds (handles numeric or MM:SS strings)
    function parseDurationToSeconds(d) {
        if (d == null) return null;
        if (typeof d === 'number') return d;
        if (typeof d === 'string') {
            const parts = d.split(':').map(p => parseInt(p, 10));
            if (parts.length === 2 && parts.every(n => !isNaN(n))) return parts[0] * 60 + parts[1];
            if (parts.length === 3 && parts.every(n => !isNaN(n))) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return null;
    }

    const durationData = sortedSessions.map(s => parseDurationToSeconds(s.duration));

    // Chart title
    const filterText = filter === 'all' ? 'All Exercises'
        : filter === 'seated-arm-raises' ? 'Arm Raises Only'
            : filter === 'overhead-hold' ? 'Overhead Hold Only'
                : 'Sit-to-Stand Only';
    // Create chart (special-case Sit-to-Stand to plot duration)
    const ctx = canvas.getContext('2d');
    if (filter === 'sit-to-stand') {
        const ctx = canvas.getContext('2d');

        // Helper to parse rep_splits into numeric array
        const toSecondsArray = s => {
            if (!s || !s.rep_splits) return [];
            return s.rep_splits.split(',').map(v => parseFloat(v)).filter(n => !isNaN(n));
        };

        // Build data points: one point per session with avg and attached repSpeeds
        const avgData = sortedSessions.map((s, idx) => {
            const splits = toSecondsArray(s);
            const avg = splits.length ? (splits.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(5, splits.length)) : null;
            return {
                x: labels[idx], // ensure x matches the label so Chart.js plots the point
                y: avg,
                repSpeeds: splits,
                timestamp: s.timestamp
            };
        });

        // Baseline = first session's average (oldest session)
        const baselineAvg = (avgData.length && avgData[0].y != null) ? avgData[0].y : null;

        // Personal Best: find the smallest (fastest) average value
        let pbIndex = -1;
        let pbVal = Infinity;
        avgData.forEach((d, idx) => {
            if (d.y != null && d.y < pbVal) { pbVal = d.y; pbIndex = idx; }
        });

        // If PB found, mark the avgData point with a star and larger radius
        if (pbIndex >= 0) {
            avgData[pbIndex].pointStyle = 'star';
            avgData[pbIndex].pointRadius = 10;
            avgData[pbIndex].pointBackgroundColor = '#ffd700';
            avgData[pbIndex].pointBorderColor = '#a67c00';
            avgData[pbIndex].pointBorderWidth = 2;
        }

        // Average dataset (main line) — use same style as Arm Raises
        const datasets = [
            {
                label: 'Average (session)',
                data: avgData,
                borderColor: '#28a745',
                backgroundColor: 'rgba(40,167,69,0.08)',
                borderWidth: 3,
                tension: 0.3,
                pointRadius: 5,
                pointHoverRadius: 7,
                order: 1
            }
        ];

        // Plugin draws success zone, baseline, and PB glow (footer note moved to DOM)
        const stsProgressPlugin = {
            id: 'stsProgress',
            beforeDatasetsDraw(chart) {
                const {ctx, chartArea, scales} = chart;
                const yScale = scales && scales.y;
                if (!yScale) return;

                // Draw green success zone between 0s and 2s
                const p0 = yScale.getPixelForValue(0);
                const p2 = yScale.getPixelForValue(2);
                const top = Math.min(p0, p2);
                const height = Math.abs(p0 - p2);
                ctx.save();
                ctx.fillStyle = 'rgba(76,175,80,0.08)';
                ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, height);

                // Draw baseline (dashed) if available
                if (baselineAvg != null) {
                    const yb = yScale.getPixelForValue(baselineAvg);
                    ctx.beginPath();
                    ctx.setLineDash([6, 6]);
                    ctx.strokeStyle = '#2e7d32';
                    ctx.lineWidth = 2;
                    ctx.moveTo(chartArea.left, yb);
                    ctx.lineTo(chartArea.right, yb);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                // Draw PB glow behind the point (if exists)
                if (pbIndex >= 0) {
                    const meta = chart.getDatasetMeta(0);
                    if (meta && meta.data && meta.data[pbIndex]) {
                        const el = meta.data[pbIndex];
                        const x = el.x, y = el.y;
                        ctx.beginPath();
                        ctx.fillStyle = 'rgba(255,215,0,0.9)';
                        ctx.shadowColor = 'rgba(76,175,80,0.7)';
                        ctx.shadowBlur = 12;
                        ctx.arc(x, y, 12, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                    }
                }

                ctx.restore();
            }
        };

        angleChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            plugins: [stsProgressPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Sit-to-Stand: Session Average Speed (seconds per rep)',
                        font: { size: 18, weight: 'bold' }
                    },
                    tooltip: {
                        mode: 'nearest',
                        intersect: true,
                        callbacks: {
                            title: (items) => {
                                if (!items || !items.length) return '';
                                const raw = items[0].raw || items[0].element?.$context?.raw;
                                const t = raw && raw.timestamp ? new Date(raw.timestamp) : null;
                                return t ? (t.toLocaleDateString() + ' ' + t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : items[0].label;
                            },
                            label: (item) => {
                                const raw = item.raw || item.element?.$context?.raw;
                                if (!raw) return '';
                                const y = raw.y;
                                return 'Average: ' + (y == null ? '--' : y.toFixed(2) + 's');
                            },
                            afterBody: (items) => {
                                if (!items || !items.length) return [];
                                const raw = items[0].raw || items[0].element?.$context?.raw;
                                if (!raw || !raw.repSpeeds) return [];
                                const lines = ['Rep breakdown:'];
                                for (let i = 0; i < raw.repSpeeds.length; i++) {
                                    const v = raw.repSpeeds[i];
                                    lines.push(`Rep ${i + 1}: ${v.toFixed(2)}s`);
                                }
                                return lines;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Session Date' }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Seconds per Rep' }
                    }
                }
            }
        });
    } else {
        angleChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Left Max Angle',
                        data: leftMaxData,
                        borderColor: '#28a745',
                        backgroundColor: 'rgba(40, 167, 69, 0.1)',
                        borderWidth: 3,
                        tension: 0.3,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    },
                    {
                        label: 'Right Max Angle',
                        data: rightMaxData,
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        borderWidth: 3,
                        tension: 0.3,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Max Shoulder Angles Over Time (${filterText})`,
                        font: { size: 18, weight: 'bold' },
                        padding: { top: 10, bottom: 20 }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { font: { size: 14 }, padding: 15 }
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function (context) {
                                return context.dataset.label + ': ' + context.parsed.y + '°';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Session Date & Time',
                            font: { size: 14, weight: 'bold' }
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Angle (degrees)',
                            font: { size: 14, weight: 'bold' }
                        },
                        beginAtZero: true,
                        max: 180,
                        ticks: { stepSize: 20 }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    console.log(`✅ Chart rendered with ${filteredSessions.length} sessions (filter: ${filter})`);
}

// Shows a blank chart frame so the UI doesn't look broken while waiting for data
function renderEmptyChart(canvas, filter) {
    let filterText;
    if (filter === 'all') filterText = 'All Exercises';
    else if (filter === 'seated-arm-raises') filterText = 'Arm Raises';
    else if (filter === 'overhead-hold') filterText = 'Overhead Hold';
    else if (filter === 'sit-to-stand') filterText = 'Sit-to-Stand';
    else filterText = 'Select a filter to display data';

    const ctx = canvas.getContext('2d');
    angleChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                title: {
                    display: true,
                    text: `Max Shoulder Angles Over Time (${filterText})`,
                    font: { size: 18, weight: 'bold' }
                },
                legend: { display: true, position: 'top' },
                tooltip: { enabled: true }
            },
            scales: {
                x: { title: { display: true, text: 'Session Date' } },
                y: {
                    title: { display: true, text: 'Angle (degrees)' },
                    beginAtZero: true,
                    max: 180
                }
            }
        }
    });
}

// Creates the chart filter buttons
export function setupChartFilters() {
    const filterButtons = document.querySelectorAll('.chart-filter-btn');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active button styling
            filterButtons.forEach(b => {
                b.classList.remove('active');
                const color = b.dataset.filter === 'all' ? '#667eea'
                    : b.dataset.filter === 'seated-arm-raises' ? '#28a745'
                        : b.dataset.filter === 'overhead-hold' ? '#ff9800'
                            : '#ff5252';
                b.style.background = 'white';
                b.style.color = color;
            });

            btn.classList.add('active');
            const activeColor = btn.dataset.filter === 'all' ? '#667eea'
                : btn.dataset.filter === 'seated-arm-raises' ? '#28a745'
                    : btn.dataset.filter === 'overhead-hold' ? '#ff9800'
                        : '#ff5252';
            btn.style.background = activeColor;
            btn.style.color = 'white';

            // Toggle STS progress note visibility
            const stsNote = document.getElementById('sts-progress-note');
            if (stsNote) stsNote.style.display = (btn.dataset.filter === 'sit-to-stand') ? 'inline-block' : 'none';

            // Re-render chart with new filter
            renderAngleChart(allSessions, btn.dataset.filter);
        });
    });
}

export { allSessions, chartFilter, angleChart };
