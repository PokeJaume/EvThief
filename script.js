let pokemonData = {};
let filteredData = {};
let showOnlyPopular = false;
let currentSort = 'usage';

// Event listeners
document.addEventListener('DOMContentLoaded', async function() {
    populateMonthOptions();
    await populateRegulationsAndElos(); // Load available regulations first
    document.getElementById('loadDataBtn').addEventListener('click', loadSmogonData);
    document.getElementById('applyFilterBtn').addEventListener('click', filterResults);
    
    // Allow Enter key to trigger filtering in search inputs
    document.getElementById('searchPokemon').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') filterResults();
    });
    document.getElementById('searchEVs').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') filterResults();
    });
});

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
            option.textContent = reg.toUpperCase();
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
        // Fallback to defaults
        const regSelect = document.getElementById('regulationSelect');
        const eloSelect = document.getElementById('eloSelect');
        
        ['regh', 'regi', 'regj'].forEach((reg, index) => {
            const option = document.createElement('option');
            option.value = reg;
            option.textContent = reg.toUpperCase();
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
 * Check if cached data is available
 */
async function checkCachedData() {
    try {
        const response = await fetch('/api/available-months');
        if (response.ok) {
            const data = await response.json();
            return data.available_months || [];
        }
    } catch (error) {
        console.log('No cached data available, will use proxy');
    }
    return [];
}

/**
 * Load data from cache or Smogon API
 */
async function loadSmogonData() {
    const month = document.getElementById('monthSelect').value;
    const format = document.getElementById('formatSelect').value;
    const regulation = document.getElementById('regulationSelect').value;
    const elo = document.getElementById('eloSelect').value;
    
    // Check for cached data first
    const cachedMonths = await checkCachedData();
    const hasCachedData = cachedMonths.some(cm => cm.month === month);
    
    const dataSource = hasCachedData ? 'caché local' : 'Smogon API';
    const speedNote = hasCachedData ? '⚡ Acceso instantáneo' : '📡 Descargando datos';
    
    const formatLabel = format === 'bo1' ? 'BO1' : 'BO3';
    const regulationLabel = regulation.toUpperCase();
    document.getElementById('loadStatus').innerHTML = `<strong>${speedNote} de ${month} ${formatLabel} ${regulationLabel} (ELO ${elo}+) desde ${dataSource}...</strong>`;
    document.getElementById('loading').style.display = 'block';
    document.getElementById('error').style.display = 'none';
    document.getElementById('results').style.display = 'none';
    document.getElementById('statsummary').style.display = 'none';
    
    try {
        let url;
        
        if (hasCachedData) {
            // Use cached data API
            url = `/api/cached/${month}/gen9ou/${format}/${regulation}/${elo}`;
            console.log('Using cached data from:', url);
        } else {
            // Use proxy API
            url = `/api/smogon/${month}/${format}/${regulation}/${elo}`;
            console.log('Using proxy API:', url);
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        const successIcon = hasCachedData ? '⚡' : '✅';
        document.getElementById('loadStatus').innerHTML = `<strong>${successIcon} Datos cargados exitosamente desde ${dataSource}</strong>`;
        processSmogonData(data);
        
        // Show success message for cached data
        if (hasCachedData) {
            console.log('⚡ Datos cargados instantáneamente desde caché local');
        }
        
    } catch (error) {
        console.error('Error loading data:', error);
        
        // Try fallback to proxy if cached data failed
        if (hasCachedData) {
            console.log('Cached data failed, trying proxy...');
            try {
                const fallbackUrl = `/api/smogon/${month}/${format}/${regulation}/${elo}`;
                const fallbackResponse = await fetch(fallbackUrl);
                
                if (fallbackResponse.ok) {
                    const fallbackData = await fallbackResponse.json();
                    document.getElementById('loadStatus').innerHTML = `<strong>✅ Datos cargados desde Smogon API (fallback)</strong>`;
                    processSmogonData(fallbackData);
                    return;
                }
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
            }
        }
        
        let errorMessage = `Error al cargar los datos desde ${dataSource}. `;
        
        if (error.message.includes('HTTP: 404')) {
            errorMessage += 'Los datos para este mes/ELO no están disponibles.';
        } else if (error.message.includes('Failed to fetch')) {
            errorMessage += 'Problema de conexión. Verifica tu conexión a internet.';
        } else {
            errorMessage += `Detalles: ${error.message}`;
        }
        
        showError(errorMessage);
        document.getElementById('loadStatus').innerHTML = `<strong>❌ Error al cargar datos</strong>`;
    }
}

/**
 * Process Smogon data from the uploaded JSON file
 */
function processSmogonData(data) {
    pokemonData = {};
    let totalSpreads = 0;
    
    // Debug: show JSON structure
    console.log('Estructura del JSON:', Object.keys(data).slice(0, 5));
    console.log('Primera entrada:', Object.entries(data)[0]);
    
    // Handle Smogon chaos structure with data.data
    const dataToProcess = data.data || data;
    
    // Process each Pokémon in the JSON
    for (const [pokemonName, pokemonInfo] of Object.entries(dataToProcess)) {
        console.log(`Procesando ${pokemonName}:`, Object.keys(pokemonInfo));
        
        // Handle different JSON structures
        let spreadsData = null;
        let totalCount = 0;
        
        if (pokemonInfo.Spreads) {
            // Current chaos structure: pokemonInfo.Spreads
            spreadsData = pokemonInfo.Spreads;
            totalCount = pokemonInfo["Raw count"] || 0;
        } else if (pokemonInfo.Raw && pokemonInfo.Raw.spreads) {
            // Alternative chaos structure
            spreadsData = pokemonInfo.Raw.spreads;
            totalCount = pokemonInfo.Raw.count;
        } else if (pokemonInfo.spreads) {
            // Alternative lowercase structure
            spreadsData = pokemonInfo.spreads;
            totalCount = pokemonInfo.count || pokemonInfo["raw count"] || 0;
        }
        
        if (!spreadsData) {
            console.log(`No se encontraron spreads para ${pokemonName}`);
            continue;
        }

        const spreads = [];
        
        // Process each spread
        for (const [spreadString, usage] of Object.entries(spreadsData)) {
            // Verify valid spread format (Nature:HP/Atk/Def/SpA/SpD/Spe)
            if (!spreadString.includes(':') || !spreadString.includes('/')) continue;
            
            const evs = parseEVSpread(spreadString);
            const usageNum = parseFloat(usage) || 0;
            const percentage = totalCount > 0 ? ((usageNum / totalCount) * 100).toFixed(2) : '0.00';
            
            spreads.push({
                spread: spreadString,
                evs: evs,
                usage: usageNum,
                percentage: parseFloat(percentage),
                formattedPercentage: percentage + '%'
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
    document.getElementById('statsummary').style.display = 'block';
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
    
    for (const [pokemonName, spreads] of sortedPokemon) {
        html += `<div class="pokemon-card">`;
        html += `<div class="pokemon-name">${pokemonName} <span class="set-count">(${spreads.length} sets)</span></div>`;
        
        for (const spread of spreads) {
            const evs = spread.evs;
            if (!evs) continue;
            
            // Color code usage percentage
            let usageClass = 'usage-percent';
            if (spread.percentage > 20) usageClass += ' high-usage';
            else if (spread.percentage > 10) usageClass += ' medium-usage';
            else usageClass += ' low-usage';
            
            html += `<div class="ev-spread">`;
            html += `<div class="ev-values">`;
            html += `<span class="ev-stat">HP: ${evs.hp}</span>`;
            html += `<span class="ev-stat">Atk: ${evs.atk}</span>`;
            html += `<span class="ev-stat">Def: ${evs.def}</span>`;
            html += `<span class="ev-stat">SpA: ${evs.spa}</span>`;
            html += `<span class="ev-stat">SpD: ${evs.spd}</span>`;
            html += `<span class="ev-stat">Spe: ${evs.spe}</span>`;
            html += `<span class="ev-stat nature">${evs.nature}</span>`;
            html += `</div>`;
            html += `<div class="${usageClass}">${spread.formattedPercentage}</div>`;
            html += `</div>`;
        }
        
        html += `</div>`;
    }
    
    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
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
 * Toggle showing only popular spreads (>5%)
 */
function toggleOnlyPopular() {
    showOnlyPopular = !showOnlyPopular;
    
    const btn = document.querySelector('button[onclick="toggleOnlyPopular()"]');
    if (showOnlyPopular) {
        btn.classList.add('active');
        btn.textContent = '⭐ Mostrando populares';
    } else {
        btn.classList.remove('active');
        btn.textContent = '⭐ Solo populares (>5%)';
    }
    
    filterResults();
}

/**
 * Toggle help panel visibility
 */
function toggleHelpPanel() {
    const helpPanel = document.getElementById('helpPanel');
    const button = document.querySelector('button[onclick="toggleHelpPanel()"]');
    
    if (helpPanel.style.display === 'none') {
        helpPanel.style.display = 'block';
        button.classList.add('active');
        button.textContent = '❌ Cerrar ayuda';
    } else {
        helpPanel.style.display = 'none';
        button.classList.remove('active');
        button.textContent = '❓ Ayuda filtros';
    }
}
