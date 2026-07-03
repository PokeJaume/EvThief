let pokemonData = {};
let filteredData = {};
let showOnlyPopular = false;
let currentSort = 'usage';
let manifestData = null;

/**
 * Toggle light/dark theme
 */
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    document.getElementById('themeIcon').textContent = isDark ? '🌙' : '☀️';
    document.getElementById('themeLabel').textContent = isDark ? 'Modo oscuro' : 'Modo claro';
}

/**
 * Format percentage with adaptive decimal places based on magnitude
 */
function formatPercentage(value) {
    if (value === 0) return '0%';
    if (value >= 1) return value.toFixed(2) + '%';
    if (value >= 0.01) return value.toFixed(4) + '%';
    if (value >= 0.0001) return value.toFixed(6) + '%';
    return value.toFixed(8) + '%';
}

// Event listeners
document.addEventListener('DOMContentLoaded', async function() {
    // Apply saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('themeIcon').textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    document.getElementById('themeLabel').textContent = savedTheme === 'dark' ? 'Modo claro' : 'Modo oscuro';

    // Prefer pre-downloaded data/manifest.json (GitHub Pages);
    // fall back to live scraping via the Python server (local dev).
    const hasManifest = await loadManifest();
    if (hasManifest) {
        populateFromManifest();
    } else {
        populateMonthOptions();
        await populateRegulationsAndElos();
    }

    document.getElementById('loadDataBtn').addEventListener('click', loadSmogonData);
    document.getElementById('applyFilterBtn').addEventListener('click', filterResults);

    document.getElementById('searchPokemon').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') filterResults();
    });
    document.getElementById('searchEVs').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') filterResults();
    });
});

/**
 * Format regulation display (regf -> Reg F, regh -> Reg H, regma -> Champions Reg MA, etc.)
 */
function formatRegulation(reg) {
    const lowerReg = reg.toLowerCase();
    const suffix = lowerReg.replace('reg', '').toUpperCase();
    // Multi-letter regulations are Champions Series formats
    if (suffix.length > 1) {
        return `Champions Reg ${suffix}`;
    }
    return `Reg ${suffix}`;
}

/**
 * Fetch available regulations and ELO levels from server
 */
async function populateRegulationsAndElos() {
    try {
        const response = await fetch('/api/available-regulations');
        if (!response.ok) throw new Error('Failed to fetch regulations');
        
        const data = await response.json();
        const regulations = data.regulations || [];
        const elos = data.elo_levels || ['0', '1500', '1630', '1760'];
        
        // Populate regulations select
        const regSelect = document.getElementById('regulationSelect');
        regSelect.innerHTML = '';
        regulations.forEach((reg, index) => {
            const option = document.createElement('option');
            option.value = reg;
            option.textContent = formatRegulation(reg);
            if (index === 0) option.selected = true;
            regSelect.appendChild(option);
        });
        
        // Populate ELO select
        const eloSelect = document.getElementById('eloSelect');
        eloSelect.innerHTML = '';
        elos.forEach((elo, index) => {
            const option = document.createElement('option');
            option.value = elo;
            option.textContent = elo;
            if (index === 1) option.selected = true; // Select second option (usually 1500)
            eloSelect.appendChild(option);
        });
        
        console.log('Regulations and ELOs loaded:', regulations, elos);
    } catch (error) {
        console.error('Error loading regulations:', error);
        // Fallback to defaults - now includes regf
        const regSelect = document.getElementById('regulationSelect');
        const eloSelect = document.getElementById('eloSelect');
        
        ['regf', 'regh', 'regi', 'regj', 'regma'].forEach((reg, index) => {
            const option = document.createElement('option');
            option.value = reg;
            option.textContent = formatRegulation(reg);
            if (index === 0) option.selected = true;
            regSelect.appendChild(option);
        });
        
        ['0', '1500', '1630', '1760'].forEach((elo, index) => {
            const option = document.createElement('option');
            option.value = elo;
            option.textContent = elo;
            if (index === 1) option.selected = true;
            eloSelect.appendChild(option);
        });
    }
}

/**
 * Populate month options based on current date and availability rules
 */
function populateMonthOptions() {
    const monthSelect = document.getElementById('monthSelect');
    const currentDate = new Date();
    const currentDay = currentDate.getDate();
    const currentMonth = currentDate.getMonth() + 1; // 0-based to 1-based
    const currentYear = currentDate.getFullYear();
    
    // Clear existing options
    monthSelect.innerHTML = '';
    
    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    const options = [];
    
    // Always start from previous month since current month data isn't available until after the 5th
    let startMonth = currentMonth - 1;
    let startYear = currentYear;
    
    if (startMonth < 1) {
        startMonth = 12;
        startYear--;
    }
    
    // Generate 12 months of options going back from start month
    for (let i = 0; i < 12; i++) {
        let month = startMonth - i;
        let year = startYear;
        
        if (month < 1) {
            month += 12;
            year--;
        }
        
        const value = `${year}-${month.toString().padStart(2, '0')}`;
        const label = `${monthNames[month - 1]} ${year}`;
        
        options.push({ value, label, year, month });
    }
    
    // Add options to select (most recent first)
    options.forEach((option, index) => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        if (index === 0) optionElement.selected = true; // Select most recent available
        monthSelect.appendChild(optionElement);
    });
}

/**
 * Load data/manifest.json.
 * Returns true if the manifest is available and has at least one month of data.
 */
async function loadManifest() {
    try {
        const res = await fetch('./data/manifest.json');
        if (!res.ok) return false;
        const m = await res.json();
        if (m.available_months && m.available_months.length > 0) {
            manifestData = m;
            console.log('Manifest loaded:', m.available_months);
            return true;
        }
    } catch (e) {
        console.log('Manifest not available, falling back to server API');
    }
    return false;
}

/**
 * Populate all dropdowns from data/manifest.json.
 */
function populateFromManifest() {
    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    // Months
    const monthSelect = document.getElementById('monthSelect');
    monthSelect.innerHTML = '';
    manifestData.available_months.forEach((m, i) => {
        const [y, mo] = m.split('-');
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = `${monthNames[parseInt(mo) - 1]} ${y}`;
        if (i === 0) opt.selected = true;
        monthSelect.appendChild(opt);
    });

    // Regulations (unique, from files list)
    const regs = [...new Set(manifestData.files.map(f => f.regulation))].sort();
    const regSelect = document.getElementById('regulationSelect');
    regSelect.innerHTML = '';
    regs.forEach((reg, i) => {
        const opt = document.createElement('option');
        opt.value = reg;
        opt.textContent = formatRegulation(reg);
        if (i === regs.length - 1) opt.selected = true; // most recent regulation
        regSelect.appendChild(opt);
    });

    // ELO levels (unique, sorted numerically)
    const elos = [...new Set(manifestData.files.map(f => f.elo))].sort((a, b) => parseInt(a) - parseInt(b));
    const eloSelect = document.getElementById('eloSelect');
    eloSelect.innerHTML = '';
    elos.forEach((elo, i) => {
        const opt = document.createElement('option');
        opt.value = elo;
        opt.textContent = elo;
        if (i === 1) opt.selected = true; // default: 1500
        eloSelect.appendChild(opt);
    });
}

/**
 * Load VGC data.
 * - On GitHub Pages: reads from pre-downloaded data/{month}/{regulation}_{format}_{elo}.json
 * - Local dev (no manifest): proxies live through the Python server
 */
async function loadSmogonData() {
    const month = document.getElementById('monthSelect').value;
    const format = document.getElementById('formatSelect').value;
    const regulation = document.getElementById('regulationSelect').value;
    const elo = document.getElementById('eloSelect').value;

    const formatLabel = format === 'bo1' ? 'BO1' : 'BO3';
    const regulationLabel = formatRegulation(regulation);
    const source = manifestData ? '⚡ Cargando archivo local' : '📡 Descargando de Smogon';
    document.getElementById('loadStatus').innerHTML =
        `<strong>${source} — ${month} ${formatLabel} ${regulationLabel} ELO ${elo}+...</strong>`;
    document.getElementById('loading').style.display = 'block';
    document.getElementById('error').style.display = 'none';
    document.getElementById('results').style.display = 'none';
    document.getElementById('statsummary').style.display = 'none';

    try {
        let url;
        if (manifestData) {
            // GitHub Pages path: read pre-downloaded file
            url = `./data/${month}/${regulation}_${format}_${elo}.json`;
        } else {
            // Local dev fallback: Python server proxy
            url = `/api/smogon/${month}/${format}/${regulation}/${elo}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            const hint = response.status === 404
                ? 'Esta combinación de mes/regulación/ELO no está disponible en los archivos descargados.'
                : `Error HTTP ${response.status}`;
            throw new Error(hint);
        }

        const data = await response.json();
        document.getElementById('loadStatus').innerHTML =
            `<strong>✅ Datos cargados — ${month} ${formatLabel} ${regulationLabel} ELO ${elo}+</strong>`;
        processSmogonData(data);

    } catch (error) {
        console.error('Error loading data:', error);
        let msg = error.message || 'Error desconocido.';
        if (msg.includes('Failed to fetch')) msg = 'No se pudo conectar. Comprueba tu conexión.';
        showError(msg);
        document.getElementById('loadStatus').innerHTML = `<strong>❌ Error al cargar datos</strong>`;
    }
}

/**
 * Process Smogon data from the uploaded JSON file
 */
function processSmogonData(data) {
    pokemonData = {};
    let totalSpreads = 0;
    
    // Handle Smogon chaos structure with data.data
    const dataToProcess = data.data || data;
    console.log('dataToProcess type:', typeof dataToProcess, 'keys count:', Object.keys(dataToProcess).length);
    
    // Process each Pokémon in the JSON
    for (const [pokemonName, pokemonInfo] of Object.entries(dataToProcess)) {
        // Handle different JSON structures
        let spreadsData = null;
        let totalCount = 0;
        
        if (pokemonInfo.Spreads) {
            spreadsData = pokemonInfo.Spreads;
            totalCount = pokemonInfo["Raw count"] || 0;
        } else if (pokemonInfo.Raw && pokemonInfo.Raw.spreads) {
            spreadsData = pokemonInfo.Raw.spreads;
            totalCount = pokemonInfo.Raw.count;
        } else if (pokemonInfo.spreads) {
            spreadsData = pokemonInfo.spreads;
            totalCount = pokemonInfo.count || pokemonInfo["raw count"] || 0;
        }
        
        if (!spreadsData) continue;

        const spreads = [];
        
        // Process each spread
        for (const [spreadString, usage] of Object.entries(spreadsData)) {
            // Verify valid spread format (Nature:HP/Atk/Def/SpA/SpD/Spe)
            if (!spreadString.includes(':') || !spreadString.includes('/')) continue;
            
            const evs = parseEVSpread(spreadString);
            const usageNum = parseFloat(usage) || 0;
            const percentageValue = totalCount > 0 ? (usageNum / totalCount) * 100 : 0;
            
            spreads.push({
                spread: spreadString,
                evs: evs,
                usage: usageNum,
                percentage: percentageValue,
                formattedPercentage: formatPercentage(percentageValue)
            });
            
            totalSpreads++;
        }
        
        if (spreads.length > 0) {
            // Sort spreads by usage (highest first)
            spreads.sort((a, b) => b.percentage - a.percentage);
            pokemonData[pokemonName] = spreads;
        }
    }
    
    document.getElementById('loading').style.display = 'none';
    
    if (Object.keys(pokemonData).length === 0) {
        showError('No se encontraron datos válidos de EV spreads en el archivo. Verifica que sea un archivo chaos de Smogon válido.');
        return;
    }
    
    console.log(`Procesados ${Object.keys(pokemonData).length} Pokémon con ${totalSpreads} spreads`);
    
    // Update statistics
    updateStatistics();
    
    // Display results
    filteredData = { ...pokemonData };
    displayResults();
}

/**
 * Parse EV spread string into individual stats
 */
function parseEVSpread(spreadString) {
    try {
        // Format: "Nature:HP/Atk/Def/SpA/SpD/Spe"
        const parts = spreadString.split(':');
        if (parts.length !== 2) return null;
        
        const nature = parts[0];
        const evParts = parts[1].split('/');
        
        if (evParts.length !== 6) return null;
        
        return {
            nature: nature,
            hp: parseInt(evParts[0]) || 0,
            atk: parseInt(evParts[1]) || 0,
            def: parseInt(evParts[2]) || 0,
            spa: parseInt(evParts[3]) || 0,
            spd: parseInt(evParts[4]) || 0,
            spe: parseInt(evParts[5]) || 0
        };
    } catch (error) {
        console.error('Error parsing EV spread:', spreadString, error);
        return null;
    }
}

/**
 * Display error message
 */
function showError(message) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').textContent = message;
    document.getElementById('error').style.display = 'block';
}

/**
 * Update statistics display
 */
function updateStatistics() {
    const totalPokemon = Object.keys(pokemonData).length;
    const totalSpreads = Object.values(pokemonData).reduce((sum, spreads) => sum + spreads.length, 0);
    const avgSpreads = totalPokemon > 0 ? (totalSpreads / totalPokemon).toFixed(1) : 0;
    
    document.getElementById('totalPokemon').textContent = totalPokemon;
    document.getElementById('totalSpreads').textContent = totalSpreads;
    document.getElementById('avgSpreads').textContent = avgSpreads;
    document.getElementById('statsummary').style.display = 'flex';
}

/**
 * Filter results based on search criteria
 */
function filterResults() {
    const pokemonSearch = document.getElementById('searchPokemon').value.toLowerCase().trim();
    const evSearch = document.getElementById('searchEVs').value.toLowerCase().trim();
    
    filteredData = {};
    
    for (const [pokemonName, spreads] of Object.entries(pokemonData)) {
        // Filter by Pokémon name
        if (pokemonSearch && !pokemonName.toLowerCase().includes(pokemonSearch)) {
            continue;
        }
        
        let filteredSpreads = spreads;
        
        // Filter by EV spread
        if (evSearch) {
            filteredSpreads = spreads.filter(spread => {
                return matchesEVSearch(spread, evSearch);
            });
        }
        
        // Filter by popularity
        if (showOnlyPopular) {
            filteredSpreads = filteredSpreads.filter(spread => spread.percentage > 5);
        }
        
        if (filteredSpreads.length > 0) {
            filteredData[pokemonName] = filteredSpreads;
        }
    }
    
    displayResults();
}

/**
 * Check if a spread matches the EV search criteria
 */
function matchesEVSearch(spread, evSearch) {
    // Support different formats:
    // 1. "252/0/4/0/0/252" - traditional format
    // 2. "HP:252,Atk:252" - stat:value format
    // 3. "Spe>120", "HP<200", "Atk=252" - comparison operators
    // 4. "Spe>120,HP<200" - multiple comparisons
    // 5. "nature:Adamant" - nature filtering
    
    const spreadStr = spread.spread.toLowerCase();
    const evs = spread.evs;
    
    if (!evs) return false;
    
    // Format 5: Nature filtering (nature:Adamant, nature:Jolly, nature!=Adamant)
    if (evSearch.toLowerCase().includes('nature')) {
        return evaluateNatureFilter(evs, evSearch);
    }
    
    // Format 1: Traditional slash-separated format
    if (evSearch.includes('/')) {
        const searchParts = evSearch.split('/').map(part => parseInt(part.trim()) || 0);
        if (searchParts.length === 6) {
            return searchParts[0] === evs.hp &&
                   searchParts[1] === evs.atk &&
                   searchParts[2] === evs.def &&
                   searchParts[3] === evs.spa &&
                   searchParts[4] === evs.spd &&
                   searchParts[5] === evs.spe;
        }
    }
    
    // Format 3: Comparison operators (Spe>120, HP<200, Atk=252)
    if (evSearch.match(/[><!=]/)) {
        return evaluateComparisonFilters(evs, evSearch);
    }
    
    // Format 2: Stat:value format (exact matches)
    if (evSearch.includes(':')) {
        const statMappings = {
            'hp': evs.hp, 'health': evs.hp,
            'atk': evs.atk, 'attack': evs.atk, 'att': evs.atk,
            'def': evs.def, 'defense': evs.def,
            'spa': evs.spa, 'spatk': evs.spa, 'special attack': evs.spa, 'sp.atk': evs.spa,
            'spd': evs.spd, 'spdef': evs.spd, 'special defense': evs.spd, 'sp.def': evs.spd,
            'spe': evs.spe, 'speed': evs.spe
        };
        
        const searchPairs = evSearch.split(',');
        return searchPairs.every(pair => {
            const [stat, value] = pair.split(':').map(s => s.trim());
            const expectedValue = parseInt(value) || 0;
            const actualValue = statMappings[stat.toLowerCase()] || 0;
            return actualValue === expectedValue;
        });
    }
    
    // Fallback: simple string inclusion
    return spreadStr.includes(evSearch);
}

/**
 * Evaluate nature filters like nature:Adamant, nature:Jolly, nature!=Adamant
 */
function evaluateNatureFilter(evs, searchString) {
    // Split by comma to handle multiple conditions including nature
    const conditions = searchString.split(',').map(s => s.trim());
    
    return conditions.every(condition => {
        if (condition.toLowerCase().includes('nature')) {
            // Handle both nature:Adamant and nature!=Adamant formats
            const match = condition.match(/^nature\s*(!=|=|:)\s*([a-zA-Z]+)$/i);
            if (match) {
                const operator = match[1];
                const targetNature = match[2].trim().toLowerCase();
                const actualNature = evs.nature.toLowerCase();
                
                if (operator === '!=' || operator === '≠') {
                    return actualNature !== targetNature;
                } else {
                    return actualNature === targetNature;
                }
            }
            return false;
        } else {
            // Handle other types of conditions (EV comparisons, etc.)
            if (condition.match(/[><!=]/)) {
                return evaluateComparisonFilters(evs, condition);
            } else if (condition.includes(':')) {
                // Handle stat:value format
                const statMappings = {
                    'hp': evs.hp, 'health': evs.hp,
                    'atk': evs.atk, 'attack': evs.atk, 'att': evs.atk,
                    'def': evs.def, 'defense': evs.def,
                    'spa': evs.spa, 'spatk': evs.spa, 'special attack': evs.spa, 'sp.atk': evs.spa,
                    'spd': evs.spd, 'spdef': evs.spd, 'special defense': evs.spd, 'sp.def': evs.spd,
                    'spe': evs.spe, 'speed': evs.spe
                };
                
                const [stat, value] = condition.split(':').map(s => s.trim());
                const expectedValue = parseInt(value) || 0;
                const actualValue = statMappings[stat.toLowerCase()] || 0;
                return actualValue === expectedValue;
            }
            return true;
        }
    });
}

/**
 * Evaluate comparison filters like Spe>120, HP<200, Atk=252
 */
function evaluateComparisonFilters(evs, searchString) {
    const statMappings = {
        'hp': evs.hp, 'health': evs.hp,
        'atk': evs.atk, 'attack': evs.atk, 'att': evs.atk,
        'def': evs.def, 'defense': evs.def,
        'spa': evs.spa, 'spatk': evs.spa, 'special attack': evs.spa, 'sp.atk': evs.spa, 'spatk': evs.spa,
        'spd': evs.spd, 'spdef': evs.spd, 'special defense': evs.spd, 'sp.def': evs.spd, 'spdef': evs.spd,
        'spe': evs.spe, 'speed': evs.spe
    };
    
    // Split by comma to handle multiple conditions
    const conditions = searchString.split(',').map(s => s.trim());
    
    return conditions.every(condition => {
        // Match patterns like "Spe>120", "HP<=200", "Atk=252", "Def!=0"
        const match = condition.match(/^([a-zA-Z]+)\s*(>=|<=|>|<|!=|=)\s*(\d+)$/);
        
        if (!match) {
            console.warn(`Invalid comparison format: ${condition}`);
            return false;
        }
        
        const [, statName, operator, valueStr] = match;
        const targetValue = parseInt(valueStr);
        const actualValue = statMappings[statName.toLowerCase()];
        
        if (actualValue === undefined) {
            console.warn(`Unknown stat: ${statName}`);
            return false;
        }
        
        switch (operator) {
            case '>':
                return actualValue > targetValue;
            case '>=':
                return actualValue >= targetValue;
            case '<':
                return actualValue < targetValue;
            case '<=':
                return actualValue <= targetValue;
            case '=':
                return actualValue === targetValue;
            case '!=':
                return actualValue !== targetValue;
            default:
                console.warn(`Unknown operator: ${operator}`);
                return false;
        }
    });
}

/**
 * Display filtered results
 */
function displayResults() {
    const resultsDiv = document.getElementById('results');
    
    if (Object.keys(filteredData).length === 0) {
        resultsDiv.innerHTML = '<div class="error-message">No se encontraron resultados que coincidan con los criterios de búsqueda.</div>';
        resultsDiv.style.display = 'block';
        return;
    }
    
    // Sort Pokémon based on current sort method
    const sortedPokemon = Object.entries(filteredData).sort((a, b) => {
        if (currentSort === 'name') {
            return a[0].localeCompare(b[0]);
        } else {
            // Sort by highest usage of top spread
            const aTopUsage = a[1][0]?.percentage || 0;
            const bTopUsage = b[1][0]?.percentage || 0;
            return bTopUsage - aTopUsage;
        }
    });
    
    let html = '';
    
    const chevronSvg = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 5L7 9L11 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const DEFAULT_SPREADS_SHOWN = 25;

    for (const [pokemonName, spreads] of sortedPokemon) {
        // encodeURIComponent handles any character (apostrophes, accents, etc.)
        const encodedName = encodeURIComponent(pokemonName);

        html += `<div class="pokemon-card">`;
        html += `<div class="pokemon-header" onclick="toggleCollapse(this)">`;
        html += `<div class="pokemon-header-left">`;
        html += `<span class="pokemon-name">${pokemonName}</span>`;
        html += `<span class="set-count">${spreads.length} sets</span>`;
        html += `</div>`;
        html += `<span class="collapse-arrow">${chevronSvg}</span>`;
        html += `</div>`;
        html += `<div class="spreads-container">`;

        const visibleSpreads = spreads.slice(0, DEFAULT_SPREADS_SHOWN);
        const hiddenCount = spreads.length - visibleSpreads.length;

        for (const spread of visibleSpreads) {
            const evs = spread.evs;
            if (!evs) continue;

            let usageClass = 'usage-percent';
            if (spread.percentage > 20) usageClass += ' high-usage';
            else if (spread.percentage > 10) usageClass += ' medium-usage';
            else usageClass += ' low-usage';

            const encodedSpread = encodeURIComponent(spread.spread);

            html += `<div class="ev-spread">`;
            html += `<div class="ev-values">`;
            html += `<span class="ev-stat nature">${evs.nature}</span>`;
            html += `<span class="ev-stat">HP: ${evs.hp}</span>`;
            html += `<span class="ev-stat">Atk: ${evs.atk}</span>`;
            html += `<span class="ev-stat">Def: ${evs.def}</span>`;
            html += `<span class="ev-stat">SpA: ${evs.spa}</span>`;
            html += `<span class="ev-stat">SpD: ${evs.spd}</span>`;
            html += `<span class="ev-stat">Spe: ${evs.spe}</span>`;
            html += `</div>`;
            html += `<div class="usage-actions">`;
            html += `<span class="${usageClass}">${spread.formattedPercentage}</span>`;
            html += `<button class="copy-btn" onclick="copySpreadToClipboard(decodeURIComponent('${encodedName}'),decodeURIComponent('${encodedSpread}'))" title="Copiar spread">⧉</button>`;
            html += `</div>`;
            html += `</div>`;
        }

        if (hiddenCount > 0) {
            html += `<div class="show-more-row"><button class="show-more-btn" onclick="expandSpreads(this,decodeURIComponent('${encodedName}'))">+ ${hiddenCount} spreads más</button></div>`;
        }

        html += `</div>`; // spreads-container
        html += `</div>`; // pokemon-card
    }
    
    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
}

/**
 * Copy EV spread to clipboard in Showdown format
 */
function copySpreadToClipboard(pokemonName, spreadString) {
    const parts = spreadString.split(':');
    if (parts.length !== 2) return;
    
    const nature = parts[0];
    const evs = parts[1].split('/');
    
    if (evs.length !== 6) return;
    
    // Format: EVs: 124 HP / 0 Atk / 172 Def / 68 SpA / 4 SpD / 132 Spe
    // Timid Nature
    const showdownFormat = `EVs: ${evs[0]} HP / ${evs[1]} Atk / ${evs[2]} Def / ${evs[3]} SpA / ${evs[4]} SpD / ${evs[5]} Spe\n${nature} Nature`;
    
    navigator.clipboard.writeText(showdownFormat).then(() => {
        // Find the button that was clicked to show feedback
        const buttons = document.querySelectorAll('.copy-btn');
        for (const btn of buttons) {
            if (btn.getAttribute('onclick').includes(spreadString)) {
                const originalText = btn.textContent;
                btn.textContent = '✅';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
                break;
            }
        }
    }).catch(err => {
        console.error('Error al copiar al portapapeles:', err);
    });
}

/**
 * Sort results by specified criteria
 */
function sortBy(method) {
    currentSort = method;
    
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (method === 'usage') {
        document.querySelector('button[onclick="sortBy(\'usage\')"]').classList.add('active');
    } else if (method === 'name') {
        document.querySelector('button[onclick="sortBy(\'name\')"]').classList.add('active');
    }
    
    displayResults();
}

/**
 * Toggle collapse/expand a pokemon card
 */
function toggleCollapse(headerEl) {
    headerEl.closest('.pokemon-card').classList.toggle('collapsed');
}

/**
 * Expand all remaining spreads for a Pokémon card
 */
function expandSpreads(btnEl, pokemonName) {
    // pokemonName arrives already decoded via decodeURIComponent() in the onclick
    const spreads = filteredData[pokemonName];
    if (!spreads) return;

    const showMoreRow = btnEl.closest('.show-more-row');
    const encodedName = encodeURIComponent(pokemonName);

    let html = '';
    for (const spread of spreads.slice(25)) {
        const evs = spread.evs;
        if (!evs) continue;

        let usageClass = 'usage-percent';
        if (spread.percentage > 20) usageClass += ' high-usage';
        else if (spread.percentage > 10) usageClass += ' medium-usage';
        else usageClass += ' low-usage';

        const encodedSpread = encodeURIComponent(spread.spread);

        html += `<div class="ev-spread">`;
        html += `<div class="ev-values">`;
        html += `<span class="ev-stat nature">${evs.nature}</span>`;
        html += `<span class="ev-stat">HP: ${evs.hp}</span>`;
        html += `<span class="ev-stat">Atk: ${evs.atk}</span>`;
        html += `<span class="ev-stat">Def: ${evs.def}</span>`;
        html += `<span class="ev-stat">SpA: ${evs.spa}</span>`;
        html += `<span class="ev-stat">SpD: ${evs.spd}</span>`;
        html += `<span class="ev-stat">Spe: ${evs.spe}</span>`;
        html += `</div>`;
        html += `<div class="usage-actions">`;
        html += `<span class="${usageClass}">${spread.formattedPercentage}</span>`;
        html += `<button class="copy-btn" onclick="copySpreadToClipboard(decodeURIComponent('${encodedName}'),decodeURIComponent('${encodedSpread}'))" title="Copiar spread">⧉</button>`;
        html += `</div>`;
        html += `</div>`;
    }

    showMoreRow.insertAdjacentHTML('beforebegin', html);
    showMoreRow.remove();
}

function toggleOnlyPopular() {
    showOnlyPopular = !showOnlyPopular;
    const btn = document.querySelector('button[onclick="toggleOnlyPopular()"]');
    btn.classList.toggle('active', showOnlyPopular);
    filterResults();
}

/**
 * Toggle help panel visibility
 */
function toggleHelpPanel() {
    const helpPanel = document.getElementById('helpPanel');
    const button = document.querySelector('button[onclick="toggleHelpPanel()"]');
    const isOpen = helpPanel.style.display !== 'none';
    helpPanel.style.display = isOpen ? 'none' : 'block';
    button.classList.toggle('active', !isOpen);
}
