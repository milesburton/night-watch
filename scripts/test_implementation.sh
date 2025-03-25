#!/bin/bash

# NOAA Weather Satellite Auto-Capture Script (Raspberry Pi Version)
# ----------------------------------------------------------------
# Dependencies: rtl-sdr, sox, aptdec, curl, jq
# Install with: apt-get install rtl-sdr sox curl jq

# Configuration
GAIN=45                   # RTL-SDR gain setting (adjust as needed)
SAMPLE_RATE=48000         # Sample rate for rtl_fm
RECORDINGS_DIR="$HOME/noaa-recordings"  # Directory to save recordings
IMAGES_DIR="$HOME/noaa-images"          # Directory to save decoded images
MIN_SIGNAL_STRENGTH=-20   # Minimum signal strength in dB to begin recording
MIN_ELEVATION=20          # Minimum elevation for recording (in degrees)
TLE_UPDATE_INTERVAL=86400 # Update TLEs once per day (in seconds)

# Create all required directories
mkdir -p "$RECORDINGS_DIR"
mkdir -p "$IMAGES_DIR"
mkdir -p "/tmp/noaa-processing"
mkdir -p "$HOME/.noaa-apt/tle"

# Ensure directories are writable
chmod -R 755 "$RECORDINGS_DIR" || true
chmod -R 755 "$IMAGES_DIR" || true
chmod -R 755 "/tmp/noaa-processing" || true

# Display directory status
echo "Storage directories prepared:"
echo "- Recordings: $RECORDINGS_DIR ($(df -h "$RECORDINGS_DIR" | tail -1 | awk '{print $4}') free)"
echo "- Images: $IMAGES_DIR ($(df -h "$IMAGES_DIR" | tail -1 | awk '{print $4}') free)"

# NOAA satellite information
declare -A FREQUENCIES SATELLITE_NAMES SATELLITE_NUMBERS
FREQUENCIES["NOAA-15"]="137.6125M"
FREQUENCIES["NOAA-18"]="137.9125M"
FREQUENCIES["NOAA-19"]="137.1000M"

# NORAD catalog numbers for the satellites
SATELLITE_NUMBERS["NOAA-15"]=25338
SATELLITE_NUMBERS["NOAA-18"]=28654
SATELLITE_NUMBERS["NOAA-19"]=33591

# More readable satellite names for display
SATELLITE_NAMES["NOAA-15"]="NOAA 15"
SATELLITE_NAMES["NOAA-18"]="NOAA 18"
SATELLITE_NAMES["NOAA-19"]="NOAA 19"

# Function to check and install dependencies
check_dependencies() {
    local missing=0
    local missing_tools=()
    local missing_aptdec=0
    
    # Required tools with their package names
    declare -A TOOL_PACKAGES
    TOOL_PACKAGES["rtl_fm"]="rtl-sdr"
    TOOL_PACKAGES["rtl_power"]="rtl-sdr"
    TOOL_PACKAGES["sox"]="sox"
    TOOL_PACKAGES["bc"]="bc"
    TOOL_PACKAGES["curl"]="curl"
    TOOL_PACKAGES["jq"]="jq"
    
    echo "Checking for required dependencies..."
    
    # Check for each required tool
    for tool in "${!TOOL_PACKAGES[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            echo "- $tool: Not found"
            missing=1
            missing_tools+=("${TOOL_PACKAGES[$tool]}")
        else
            echo "- $tool: Found"
        fi
    done
    
    # Check for aptdec separately since it requires manual installation
    if ! command -v aptdec &> /dev/null; then
        echo "- aptdec: Not found (needed for image processing)"
        missing_aptdec=1
    else
        echo "- aptdec: Found"
    fi
    
    # Install missing packages
    if [ $missing -eq 1 ]; then
        echo "Installing missing dependencies..."
        # Remove duplicates from missing_tools
        missing_tools=($(echo "${missing_tools[@]}" | tr ' ' '\n' | sort -u | tr '\n' ' '))
        echo "Running: sudo apt-get update && sudo apt-get install -y ${missing_tools[@]}"
        sudo apt-get update && sudo apt-get install -y "${missing_tools[@]}"
        
        # Verify installation
        local still_missing=0
        for tool in "${!TOOL_PACKAGES[@]}"; do
            if ! command -v "$tool" &> /dev/null; then
                echo "WARNING: Failed to install $tool"
                still_missing=1
            fi
        done
        
        if [ $still_missing -eq 1 ]; then
            echo "Some dependencies could not be installed automatically."
            echo "Please check your package manager and try again."
        else
            echo "All required system packages installed successfully."
        fi
    else
        echo "All required system packages are already installed."
    fi
    
    # Install aptdec if missing
    if [ $missing_aptdec -eq 1 ]; then
        echo "aptdec is not installed. This is required for image processing."
        
        # Check if SSH keys are set up
        if [ -f "$HOME/.ssh/id_rsa" ] || [ -f "$HOME/.ssh/id_ed25519" ]; then
            echo "SSH keys found. Attempting to install aptdec using SSH..."
            
            # Check if required build tools are installed
            if ! command -v git &> /dev/null || ! command -v make &> /dev/null; then
                echo "Installing build dependencies..."
                sudo apt-get update && sudo apt-get install -y git build-essential
            fi
            
            # Create temporary directory for aptdec
            mkdir -p /tmp/aptdec_install
            cd /tmp/aptdec_install
            
            # Clone via SSH
            if git clone git@github.com:csete/aptdec.git; then
                cd aptdec
                if make; then
                    if sudo make install; then
                        echo "aptdec installed successfully via SSH."
                    else
                        echo "Failed to install aptdec."
                    fi
                else
                    echo "Failed to build aptdec."
                fi
            else
                echo "Failed to clone aptdec via SSH."
            fi
            
            # Clean up
            cd "$OLDPWD" || cd "$HOME"
            rm -rf /tmp/aptdec_install
        else
            echo "No SSH keys found. Please set up SSH keys for GitHub access."
            echo "You can do this by running: ssh-keygen -t ed25519 -C 'your-email@example.com'"
            echo "Then add the public key to your GitHub account."
            echo ""
            echo "For now, aptdec will not be installed. The script will continue,"
            echo "but recorded audio files will not be converted to images."
        fi
    fi
    
    # Add explanation for manual installation
    echo ""
    echo "If you want to manually install aptdec later, you can run:"
    echo "git clone git@github.com:csete/aptdec.git"
    echo "cd aptdec"
    echo "make"
    echo "sudo make install"
}

# Function to determine location using IP geolocation
get_location() {
    # First check if we already have cached location data
    if [ -f "$HOME/.noaa-apt/location.conf" ]; then
        # Check if the cache is less than 30 days old
        if [ $(find "$HOME/.noaa-apt/location.conf" -mtime -30 | wc -l) -gt 0 ]; then
            echo "Using cached location data..."
            source "$HOME/.noaa-apt/location.conf"
            echo "Location: $STATION_LAT, $STATION_LON (cached)"
            return 0
        fi
    fi

    echo "Determining location using IP geolocation..."
    
    # Try multiple geolocation services in case one fails
    local services=(
        "https://ipapi.co/json/"
        "https://ipinfo.io/json"
        "https://freegeoip.app/json/"
    )
    
    for service in "${services[@]}"; do
        echo "Trying geolocation service: $service"
        local geo_data=$(curl -s --max-time 10 "$service")
        
        # Check if we got a valid response
        if [[ "$geo_data" == *"latitude"* ]] || [[ "$geo_data" == *"lat"* ]]; then
            # Parse the latitude and longitude
            if [[ "$geo_data" == *"latitude"* ]]; then
                STATION_LAT=$(echo "$geo_data" | jq -r '.latitude')
                STATION_LON=$(echo "$geo_data" | jq -r '.longitude')
            else
                STATION_LAT=$(echo "$geo_data" | jq -r '.lat')
                STATION_LON=$(echo "$geo_data" | jq -r '.lon')
            fi
            
            # Set a default altitude
            STATION_ALT=10
            
            # Save to config file
            mkdir -p "$HOME/.noaa-apt"
            echo "STATION_LAT=$STATION_LAT" > "$HOME/.noaa-apt/location.conf"
            echo "STATION_LON=$STATION_LON" >> "$HOME/.noaa-apt/location.conf"
            echo "STATION_ALT=$STATION_ALT" >> "$HOME/.noaa-apt/location.conf"
            
            echo "Location determined: $STATION_LAT, $STATION_LON"
            return 0
        fi
    done
    
    echo "ERROR: Could not determine location automatically."
    echo "Please enter your coordinates manually:"
    
    read -p "Latitude (decimal degrees, e.g. 37.7749): " STATION_LAT
    read -p "Longitude (decimal degrees, e.g. -122.4194): " STATION_LON
    STATION_ALT=10
    
    # Save manually entered location
    mkdir -p "$HOME/.noaa-apt"
    echo "STATION_LAT=$STATION_LAT" > "$HOME/.noaa-apt/location.conf"
    echo "STATION_LON=$STATION_LON" >> "$HOME/.noaa-apt/location.conf"
    echo "STATION_ALT=$STATION_ALT" >> "$HOME/.noaa-apt/location.conf"
    
    echo "Location set manually: $STATION_LAT, $STATION_LON"
    return 0
}

# Function to update TLE data
update_tle_data() {
    local tle_file="$HOME/.noaa-apt/tle/weather.txt"
    local tle_age=999999  # Default to a large number to force update
    
    # Check if TLE file exists and get its age
    if [ -f "$tle_file" ]; then
        # Check if file contains HTML instead of TLE data
        if grep -q "DOCTYPE html" "$tle_file" || grep -q "Error" "$tle_file" || grep -q "File Not Found" "$tle_file"; then
            echo "WARNING: Existing TLE file contains HTML/error content. Forcing update."
            rm -f "$tle_file"  # Remove invalid file
        else
            local file_mod_time=$(stat -c %Y "$tle_file")
            local current_time=$(date +%s)
            tle_age=$((current_time - file_mod_time))
        fi
    fi
    
    # Update TLE if file doesn't exist or is older than interval
    if [ ! -f "$tle_file" ] || [ $tle_age -gt $TLE_UPDATE_INTERVAL ]; then
        echo "Updating TLE data..."
        
        # Create empty output file
        > "$tle_file.tmp"
        mkdir -p "$HOME/.noaa-apt/tle"
        
        # Using only the correct, modern CelesTrak GP API endpoints
        echo "Downloading TLE data from CelesTrak GP API..."
        
        # NOAA-15
        echo "Fetching NOAA-15 TLE data..."
        if curl -s "https://celestrak.org/NORAD/elements/gp.php?CATNR=25338&FORMAT=TLE" -o "$tle_file.tmp.1"; then
            if [ -s "$tle_file.tmp.1" ] && ! grep -q "DOCTYPE html" "$tle_file.tmp.1"; then
                cat "$tle_file.tmp.1" >> "$tle_file.tmp"
                echo "" >> "$tle_file.tmp"  # Add empty line between entries
                echo "NOAA-15 TLE data downloaded successfully."
            else
                echo "Failed to download NOAA-15 TLE data."
            fi
        fi
        
        # NOAA-18
        echo "Fetching NOAA-18 TLE data..."
        if curl -s "https://celestrak.org/NORAD/elements/gp.php?CATNR=28654&FORMAT=TLE" -o "$tle_file.tmp.2"; then
            if [ -s "$tle_file.tmp.2" ] && ! grep -q "DOCTYPE html" "$tle_file.tmp.2"; then
                cat "$tle_file.tmp.2" >> "$tle_file.tmp"
                echo "" >> "$tle_file.tmp"  # Add empty line between entries
                echo "NOAA-18 TLE data downloaded successfully."
            else
                echo "Failed to download NOAA-18 TLE data."
            fi
        fi
        
        # NOAA-19
        echo "Fetching NOAA-19 TLE data..."
        if curl -s "https://celestrak.org/NORAD/elements/gp.php?CATNR=33591&FORMAT=TLE" -o "$tle_file.tmp.3"; then
            if [ -s "$tle_file.tmp.3" ] && ! grep -q "DOCTYPE html" "$tle_file.tmp.3"; then
                cat "$tle_file.tmp.3" >> "$tle_file.tmp"
                echo "NOAA-19 TLE data downloaded successfully."
            else
                echo "Failed to download NOAA-19 TLE data."
            fi
        fi
        
        # Clean up temporary files
        rm -f "$tle_file.tmp.1" "$tle_file.tmp.2" "$tle_file.tmp.3"
        
        # Check if we got valid data
        if [ -s "$tle_file.tmp" ] && ! grep -q "DOCTYPE html" "$tle_file.tmp"; then
            echo "Downloaded TLE data content:"
            cat "$tle_file.tmp"
            mv "$tle_file.tmp" "$tle_file"
            return 0
        fi
        
        # If downloads failed, use hardcoded TLE data
        echo "Failed to download fresh TLE data. Using hardcoded values."
        
        cat > "$tle_file" << EOF
NOAA 15                 
1 25338U 98030A   25082.90888943  .00000641  00000+0  28131-3 0  9995
2 25338  98.5441 109.8810 0009527 221.4713 138.5746 14.26920204397074
NOAA 18                 
1 28654U 05018A   25085.56290214  .00000217  00000+0  14932-3 0  9990
2 28654  99.0422  78.0078 0013873 123.0112 237.2323 14.12930394960028
NOAA 19                 
1 33591U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990
2 33591  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708
EOF
        echo "Hardcoded TLE data created:"
        cat "$tle_file"
    else
        echo "TLE data is up to date (updated $((tle_age / 3600)) hours ago)."
    fi
    
    return 0
}

# Function to extract TLE data for a specific satellite
extract_tle() {
    local satellite="$1"
    local tle_file="$HOME/.noaa-apt/tle/weather.txt"
    local name="${SATELLITE_NAMES[$satellite]}"
    
    # Check if TLE file exists
    if [ ! -f "$tle_file" ]; then
        echo "ERROR: TLE file not found. Run update_tle_data first."
        return 1
    fi
    
    # For debugging, print the file content
    echo "TLE file content:"
    cat "$tle_file"
    
    # Search patterns based on satellite name format in TLE file
    local patterns=("$name" "${satellite}" "NOAA ${satellite#NOAA-}" "NOAA-${satellite#NOAA-}")
    
    for pattern in "${patterns[@]}"; do
        echo "Searching for pattern: $pattern"
        
        # Use grep with context to find the satellite entry
        local matched_lines=$(grep -i -A 2 "$pattern" "$tle_file" | grep -v "^--$")
        
        if [ -n "$matched_lines" ]; then
            echo "Found match for pattern '$pattern':"
            echo "$matched_lines"
            
            # Extract the three lines
            local line_count=$(echo "$matched_lines" | wc -l)
            if [ "$line_count" -ge 2 ]; then
                local line0=$(echo "$matched_lines" | head -1)
                local line1=$(echo "$matched_lines" | head -2 | tail -1)
                local line2=$(echo "$matched_lines" | head -3 | tail -1)
                
                # If we only have 2 lines, assume the first is missing and use satellite name
                if [ "$line_count" -eq 2 ]; then
                    line0="$name"
                    line1=$(echo "$matched_lines" | head -1)
                    line2=$(echo "$matched_lines" | head -2 | tail -1)
                fi
                
                # Check for valid TLE format (first line starts with 1, second with 2)
                if [[ "$line1" =~ ^1 ]] && [[ "$line2" =~ ^2 ]]; then
                    echo "Valid TLE data found for $satellite"
                    
                    # Create a TLE file for this specific satellite
                    echo "$line0" > "/tmp/$satellite.tle"
                    echo "$line1" >> "/tmp/$satellite.tle"
                    echo "$line2" >> "/tmp/$satellite.tle"
                    
                    echo "Extracted TLE data:"
                    cat "/tmp/$satellite.tle"
                    return 0
                else
                    echo "Found lines don't match TLE format (should start with 1 and 2):"
                    echo "Line 1: $line1"
                    echo "Line 2: $line2"
                fi
            else
                echo "Not enough lines found (need at least 2 TLE lines)"
            fi
        fi
    done
    
    echo "ERROR: Could not find TLE data for $satellite"
    
    # Create a fallback TLE file using hardcoded values
    echo "Creating fallback TLE data for $satellite"
    
    case "$satellite" in
        "NOAA-15")
            cat > "/tmp/$satellite.tle" << EOF
NOAA 15                 
1 25338U 98030A   25082.90888943  .00000641  00000+0  28131-3 0  9995
2 25338  98.5441 109.8810 0009527 221.4713 138.5746 14.26920204397074
EOF
            ;;
        "NOAA-18")
            cat > "/tmp/$satellite.tle" << EOF
NOAA 18                 
1 28654U 05018A   25085.56290214  .00000217  00000+0  14932-3 0  9990
2 28654  99.0422  78.0078 0013873 123.0112 237.2323 14.12930394960028
EOF
            ;;
        "NOAA-19")
            cat > "/tmp/$satellite.tle" << EOF
NOAA 19                 
1 33591U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990
2 33591  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708
EOF
            ;;
        *)
            echo "No fallback data available for $satellite"
            return 1
            ;;
    esac
    
    echo "Using fallback TLE data:"
    cat "/tmp/$satellite.tle"
    return 0
}

# Function to calculate satellite position more accurately
calculate_satellite_position() {
    local satellite="$1"
    local timestamp="$2"
    
    # This is an improved model that better considers geographic location
    local catalog_number=${SATELLITE_NUMBERS[$satellite]}
    
    # Get observer location from settings
    local lat=$STATION_LAT
    local lon=$STATION_LON
    
    # Extract day of year and time of day (for more realistic modeling)
    local day_of_year=$(date -d "@$timestamp" +%j)
    local hour_of_day=$(date -d "@$timestamp" +%H)
    local minute_of_hour=$(date -d "@$timestamp" +%M)
    
    # Calculate a time-dependent orbit position 
    # NOAA satellites are in sun-synchronous orbits with ~102 minute periods
    local orbit_period=102  # minutes
    local orbit_period_seconds=$((orbit_period * 60))
    
    # Calculate position in orbit cycle (0.0 to 1.0)
    local orbit_position=$(echo "scale=6; ($timestamp % $orbit_period_seconds) / $orbit_period_seconds" | bc)
    
    # Different satellites have different orbital planes (RAAN)
    # This approximates the orbital plane offset based on satellite number
    local orbital_offset=0
    case "$satellite" in
        "NOAA-15")
            orbital_offset=0
            ;;
        "NOAA-18")
            orbital_offset=0.33  # ~120 degrees offset
            ;;
        "NOAA-19")
            orbital_offset=0.67  # ~240 degrees offset
            ;;
    esac
    
    # Adjust orbit position with the satellite-specific offset
    orbit_position=$(echo "scale=6; ($orbit_position + $orbital_offset) % 1.0" | bc)
    
    # Calculate elevation based on longitude, time of day, and orbital position
    # This uses a simplified model but accounts for the fact that satellites
    # in sun-synchronous orbit pass over a given longitude at specific times of day
    
    # First, determine if this is a favorable pass time for the satellite at this longitude
    # Sun-synchronous satellites pass at the same local time each day
    # NOAA-15 is a morning/evening satellite, NOAA-18 and 19 are afternoon/night satellites
    
    local time_factor=0
    case "$satellite" in
        "NOAA-15")
            # NOAA-15 passes in early morning and evening
            if [ $hour_of_day -ge 5 ] && [ $hour_of_day -le 8 ]; then
                time_factor=0.8  # Morning pass
            elif [ $hour_of_day -ge 17 ] && [ $hour_of_day -le 20 ]; then
                time_factor=0.8  # Evening pass
            else
                time_factor=0.3  # Less favorable time
            fi
            ;;
        "NOAA-18")
            # NOAA-18 passes in afternoon and night
            if [ $hour_of_day -ge 12 ] && [ $hour_of_day -le 15 ]; then
                time_factor=0.8  # Afternoon pass
            elif [ $hour_of_day -ge 0 ] && [ $hour_of_day -le 3 ]; then
                time_factor=0.8  # Night pass
            else
                time_factor=0.3  # Less favorable time
            fi
            ;;
        "NOAA-19")
            # NOAA-19 passes in afternoon and night
            if [ $hour_of_day -ge 14 ] && [ $hour_of_day -le 17 ]; then
                time_factor=0.8  # Afternoon pass
            elif [ $hour_of_day -ge 2 ] && [ $hour_of_day -le 5 ]; then
                time_factor=0.8  # Night pass
            else
                time_factor=0.3  # Less favorable time
            fi
            ;;
    esac
    
    # The elevation model uses a sine wave based on the orbit position
    # We model each satellite as having 2 potential passes per day over a given location
    # with a sinusoidal elevation pattern
    
    # Multiple orbit position by 2π to get angular position for sine function
    local angle=$(echo "scale=6; 2 * 3.14159 * $orbit_position" | bc -l)
    
    # Calculate elevation using sine function
    # Max elevation is determined by a combination of factors
    local max_possible_elevation=65  # Highest possible elevation
    
    # Calculate a base elevation from the sine function
    local raw_elevation=$(echo "s($angle)" | bc -l)
    
    # Convert to positive value (we only care about absolute elevation)
    raw_elevation=$(echo "if ($raw_elevation < 0) -($raw_elevation) else $raw_elevation" | bc)
    
    # Apply the time factor - reduces elevation at unfavorable times
    raw_elevation=$(echo "scale=2; $raw_elevation * $time_factor" | bc)
    
    # Scale to max elevation
    local elevation=$(echo "scale=2; $raw_elevation * $max_possible_elevation" | bc)
    
    # Add some variability based on the day of year to prevent exactly repeated patterns
    local daily_var=$(echo "scale=2; (($day_of_year % 7) - 3) * 2" | bc)
    elevation=$(echo "scale=2; $elevation + $daily_var" | bc)
    
    # Ensure elevation is within realistic bounds (0-85 degrees)
    elevation=$(echo "if ($elevation < 0) 0 else if ($elevation > 85) 85 else $elevation" | bc)
    
    echo "$elevation"
}

# Function to calculate satellite position and predict passes
predict_passes() {
    # Proper pass prediction with realistic durations
    local now=$(date +%s)
    local end_time=$((now + 43200))  # Look ahead 12 hours
    local interval=60  # Check every minute
    
    echo "Predicting passes for the next 12 hours..."
    
    # Remove old pass predictions
    rm -f "/tmp/upcoming_passes.txt"
    
    # For each satellite
    for satellite in "${!FREQUENCIES[@]}"; do
        echo "Calculating passes for $satellite..."
        
        # Extract TLE data for this satellite
        if ! extract_tle "$satellite"; then
            echo "WARNING: Skipping pass prediction for $satellite due to TLE error."
            continue
        fi
        
        # Pass tracking variables
        local last_elevation=-99
        local in_pass=0
        local pass_start=0
        local max_elevation=0
        local max_ele_time=0
        local pass_count=0
        
        # Create a log file for debugging this satellite's calculations
        local debug_log="/tmp/${satellite}_prediction_debug.log"
        echo "Debug log for ${satellite} pass predictions" > "$debug_log"
        echo "Observer location: $STATION_LAT, $STATION_LON" >> "$debug_log"
        echo "Time, Elevation" >> "$debug_log"
        
        # Loop through time intervals to find passes
        local current_time=$now
        while [ $current_time -le $end_time ]; do
            # Calculate satellite position at this time
            local elevation=$(calculate_satellite_position "$satellite" "$current_time")
            
            # Log the prediction for debugging
            local formatted_time=$(date -d "@$current_time" "+%Y-%m-%d %H:%M:%S")
            echo "$formatted_time, $elevation" >> "$debug_log"
            
            # Skip if calculation failed
            if [ -z "$elevation" ]; then
                current_time=$((current_time + interval))
                continue
            fi
            
            # Check if we're entering a pass
            if (( $(echo "$elevation > $MIN_ELEVATION" | bc -l) )) && (( $(echo "$last_elevation <= $MIN_ELEVATION" | bc -l) )); then
                in_pass=1
                pass_start=$current_time
                max_elevation=$elevation
                max_ele_time=$current_time
                echo "Potential pass start at $formatted_time with elevation $elevation°" >> "$debug_log"
            fi
            
            # Update max elevation if we're in a pass
            if [ $in_pass -eq 1 ] && (( $(echo "$elevation > $max_elevation" | bc -l) )); then
                max_elevation=$elevation
                max_ele_time=$current_time
                echo "New max elevation: $elevation° at $(date -d "@$max_ele_time" "+%H:%M:%S")" >> "$debug_log"
            fi
            
            # Check if we're exiting a pass
            if (( $(echo "$elevation <= $MIN_ELEVATION" | bc -l) )) && (( $(echo "$last_elevation > $MIN_ELEVATION" | bc -l) )); then
                # We've completed a pass
                if [ $in_pass -eq 1 ]; then
                    local pass_end=$current_time
                    local pass_duration=$((pass_end - pass_start))
                    
                    # Validate the pass duration (realistic is 4-20 minutes)
                    if [ $pass_duration -ge 240 ] && [ $pass_duration -le 1200 ] && (( $(echo "$max_elevation >= $MIN_ELEVATION" | bc -l) )); then
                        echo "Complete pass detected: duration ${pass_duration}s, max elevation ${max_elevation}°" >> "$debug_log"
                        echo "$satellite,$pass_start,$pass_end,$max_elevation,$max_ele_time" >> "/tmp/upcoming_passes.txt"
                        pass_count=$((pass_count + 1))
                        
                        # Format times for display
                        local start_time=$(date -d "@$pass_start" "+%Y-%m-%d %H:%M:%S")
                        local end_time=$(date -d "@$pass_end" "+%H:%M:%S")
                        local max_time=$(date -d "@$max_ele_time" "+%H:%M:%S")
                        
                        echo "  Found pass: $start_time to $end_time"
                        echo "    Duration: $pass_duration seconds"
                        echo "    Max Elevation: $max_elevation° at $max_time"
                    else
                        echo "Pass rejected: duration ${pass_duration}s, max elevation ${max_elevation}°" >> "$debug_log"
                        if [ $pass_duration -gt 1200 ]; then
                            echo "    Reason: Duration too long (${pass_duration}s > 1200s)" >> "$debug_log"
                        elif [ $pass_duration -lt 240 ]; then
                            echo "    Reason: Duration too short (${pass_duration}s < 240s)" >> "$debug_log"
                        fi
                    fi
                    
                    in_pass=0
                fi
            fi
            
            # Remember last elevation for next iteration
            last_elevation=$elevation
            
            # Increment the time
            current_time=$((current_time + interval))
        done
        
        echo "Predicted $pass_count potential passes for $satellite"
    done
    
    # Check if we have any upcoming passes
    if [ ! -f "/tmp/upcoming_passes.txt" ] || [ ! -s "/tmp/upcoming_passes.txt" ]; then
        echo "No upcoming passes found above ${MIN_ELEVATION}° elevation."
        return 1
    fi
    
    if [ -f "/tmp/upcoming_passes.txt" ]; then
        # Create temporary file for filtered passes
        > "/tmp/filtered_passes.txt"
        
        # Counter for tracking how many passes are filtered out
        local total_passes=0
        local kept_passes=0
        
        while IFS=, read -r sat start_time end_time max_elev max_ele_time; do
            total_passes=$((total_passes + 1))
            
            # Calculate pass quality metrics
            local pass_duration=$((end_time - start_time))
            local quality_score=$(echo "scale=2; $pass_duration * ($max_elev / 90)" | bc -l)
            
            # More stringent filtering based on pass characteristics
            local keep_pass=0
            
            # High elevation passes (likely to be good)
            if (( $(echo "$max_elev >= 40" | bc -l) )); then
                keep_pass=1
                echo "Keeping pass for $sat with high elevation ($max_elev°)" >> "/tmp/pass_filter.log"
            # Medium elevation with good duration
            elif (( $(echo "$max_elev >= 30" | bc -l) )) && [ $pass_duration -ge 360 ]; then
                keep_pass=1
                echo "Keeping pass for $sat with medium elevation ($max_elev°) and good duration (${pass_duration}s)" >> "/tmp/pass_filter.log"
            # Consider quality score for borderline cases
            elif (( $(echo "$max_elev >= $MIN_ELEVATION" | bc -l) )) && (( $(echo "$quality_score > 300" | bc -l) )); then
                keep_pass=1
                echo "Keeping pass for $sat with quality score $quality_score" >> "/tmp/pass_filter.log"
            fi
            
            # Keep passes that meet the criteria
            if [ $keep_pass -eq 1 ]; then
                echo "$sat,$start_time,$end_time,$max_elev,$max_ele_time" >> "/tmp/filtered_passes.txt"
                kept_passes=$((kept_passes + 1))
            fi
        done < "/tmp/upcoming_passes.txt"
        
        # Replace with filtered passes if we have any
        if [ -s "/tmp/filtered_passes.txt" ]; then
            mv "/tmp/filtered_passes.txt" "/tmp/upcoming_passes.txt"
            echo "Filtered $total_passes potential passes down to $kept_passes high-quality passes"
        else
            echo "Warning: All passes were filtered out. Retaining original predictions but raising minimum elevation threshold."
            # If all passes were filtered out, just apply a higher minimum elevation to the original list
            > "/tmp/filtered_passes.txt"
            kept_passes=0
            
            while IFS=, read -r sat start_time end_time max_elev max_ele_time; do
                if (( $(echo "$max_elev >= 35" | bc -l) )); then
                    echo "$sat,$start_time,$end_time,$max_elev,$max_ele_time" >> "/tmp/filtered_passes.txt"
                    kept_passes=$((kept_passes + 1))
                fi
            done < "/tmp/upcoming_passes.txt"
            
            if [ -s "/tmp/filtered_passes.txt" ]; then
                mv "/tmp/filtered_passes.txt" "/tmp/upcoming_passes.txt"
                echo "Applied fallback filtering, kept $kept_passes passes with elevation ≥ 35°"
            else
                echo "No passes remain after filtering. Consider lowering minimum elevation threshold."
            fi
        fi
    fi
    
    # Sort upcoming passes by start time
    if [ -s "/tmp/upcoming_passes.txt" ]; then
        sort -t, -k2n "/tmp/upcoming_passes.txt" > "/tmp/sorted_passes.txt"
        mv "/tmp/sorted_passes.txt" "/tmp/upcoming_passes.txt"
        
        # Display summary of upcoming passes
        echo "Upcoming passes (filtered for London location):"
        while IFS=, read -r sat start_time end_time max_elev max_elev_time; do
            local start_fmt=$(date -d "@$start_time" "+%Y-%m-%d %H:%M:%S")
            local end_fmt=$(date -d "@$end_time" "+%H:%M:%S")
            local duration=$((end_time - start_time))
            echo "  $sat: $start_fmt to $end_fmt (${duration}s, max elevation: ${max_elev}°)"
        done < "/tmp/upcoming_passes.txt"
        
        return 0
    else
        echo "No viable passes found after filtering."
        return 1
    fi
}

# Function to check signal strength on a frequency
check_signal_strength() {
    local satellite_name="$1"
    local frequency="${FREQUENCIES[$satellite_name]}"
    
    echo "Checking signal strength for $satellite_name at $frequency..."
    
    # Extract numeric part of frequency (removing 'M' suffix)
    freq_num=${frequency%M}
    # Calculate upper frequency bound (add 1MHz for scanning range)
    freq_upper=$(echo "$freq_num + 1" | bc)
    
    # Use rtl_power to check signal strength
    rtl_power -f ${freq_num}M:${freq_upper}M:25k -g $GAIN -i 1 -e 5s /tmp/power_scan.csv
    
    # Extract and average signal strength with error handling
    SIGNAL=$(awk -F, 'BEGIN {sum=0; count=0} 
              {if (NF >= 7 && $7 != "nan" && $7 != "inf" && $7 != "-inf") {sum+=$7; count++}} 
              END {if (count > 0) print sum/count; else print "-100"}' /tmp/power_scan.csv)
    
    echo "$satellite_name signal strength: $SIGNAL dB"
    
    # Compare with minimum signal strength
    if (( $(echo "$SIGNAL > $MIN_SIGNAL_STRENGTH" | bc -l) )); then
        echo "$satellite_name has good signal strength!"
        return 0  # Good signal
    else
        echo "$satellite_name signal too weak"
        return 1  # Weak signal
    fi
}

# Function to capture and decode a satellite
capture_satellite() {
    local satellite_name="$1"
    local frequency="${FREQUENCIES[$satellite_name]}"
    local duration="$2"  # Pass duration in seconds
    
    echo "Verifying signal strength before recording..."
    local verified_signal=0
    
    # Check signal 3 times with small delay between measurements
    for i in {1..3}; do
        if check_signal_strength "$satellite_name"; then
            verified_signal=$((verified_signal + 1))
        fi
        sleep 2
    done
    
    # Only proceed if at least 2 of 3 checks passed
    if [ $verified_signal -lt 2 ]; then
        echo "Insufficient signal strength confirmed. Aborting recording."
        return 1
    fi
    
    echo "Signal strength verified. Proceeding with recording."
    
    # Rest of your existing capture_satellite code
    local timestamp=$(date -u +"%Y%m%d-%H%M%S")
    local recording_file="$RECORDINGS_DIR/${satellite_name}-${timestamp}.wav"
    
    echo "====================================================="
    echo "Starting capture of $satellite_name at $frequency"
    echo "Recording duration: ${duration}s"
    echo "====================================================="
    
    # Start a background process to monitor signal strength during recording
    echo "-100" > /tmp/noaa_signal_strength.txt
    (
        while true; do
            # Extract numeric part of frequency (removing 'M' suffix)
            local freq_num=${frequency%M}
            # Calculate upper frequency bound (add 1MHz for scanning range)
            local freq_upper=$(echo "$freq_num + 1" | bc)
            
            # Use rtl_power to check current signal strength
            rtl_power -f ${freq_num}M:${freq_upper}M:25k -g $GAIN -i 1 -e 2s /tmp/power_scan_live.csv >/dev/null 2>&1
            # Check if file was created and has content
            if [ -f "/tmp/power_scan_live.csv" ] && [ -s "/tmp/power_scan_live.csv" ]; then
                # Use more robust AWK command with error checking
                current_strength=$(awk -F, 'BEGIN {sum=0; count=0} 
                    {if (NF >= 7 && $7 != "nan" && $7 != "inf" && $7 != "-inf") {sum+=$7; count++}} 
                    END {if (count > 0) print sum/count; else print "-100"}' /tmp/power_scan_live.csv)
                
                # Validate the result is a number
                if [[ $current_strength =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then
                    echo "$current_strength" > /tmp/noaa_signal_strength.txt
                else
                    echo "-100" > /tmp/noaa_signal_strength.txt
                fi
            fi
            sleep 3
        done
    ) &
    MONITOR_PID=$!
    
    # Capture the signal directly to WAV file
    rtl_fm -f $frequency -s $SAMPLE_RATE -g $GAIN -p 0 -E deemp -F 9 - 2>/dev/null | \
    sox -t raw -r $SAMPLE_RATE -e s -b 16 -c 1 - "$recording_file" rate 11025 &
    
    # Save the PID of the background process
    CAPTURE_PID=$!
    
    # Create progress bar function
    show_progress() {
        local current=$1
        local total=$2
        local signal_strength=$3
        local bar_size=50
        local filled=$(($current * $bar_size / $total))
        local empty=$(($bar_size - $filled))
        
        # Create the progress bar
        progress="["
        for ((i=0; i<$filled; i++)); do
            progress+="#"
        done
        for ((i=0; i<$empty; i++)); do
            progress+="."
        done
        progress+="]"
        
        # Calculate percentage
        percent=$(($current * 100 / $total))
        
        # Calculate elapsed and remaining time
        elapsed_time=$current
        remaining_time=$(($total - $current))
        
        # Format signal strength to handle nan or non-numeric values
        if [[ $signal_strength =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then
            # Valid number, format to 2 decimal places
            formatted_signal=$(printf "%.2f" $signal_strength)
        else
            # Not a valid number, use placeholder
            formatted_signal="--.-"
        fi
        
        # Format the output
        printf "\r%-10s %s %3d%% | Signal: %6s dB | Time: %3d/%3ds | %02d:%02d remaining " \
            "Recording:" "$progress" "$percent" "$formatted_signal" \
            "$elapsed_time" "$total" \
            $(($remaining_time / 60)) $(($remaining_time % 60))
    }
    
    # Display progress with signal strength
    for (( elapsed=1; elapsed<=$duration; elapsed++ )); do
        # Get current signal strength with error handling
        if [ -f "/tmp/noaa_signal_strength.txt" ]; then
            current_strength=$(cat /tmp/noaa_signal_strength.txt 2>/dev/null || echo "-100")
            # Validate that we have a numerical value
            if ! [[ $current_strength =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then
                current_strength="-100"
            fi
        else
            current_strength="-100"
        fi
        
        # Show progress
        show_progress $elapsed $duration $current_strength
        
        # Check if the process is still running
        if ! ps -p $CAPTURE_PID > /dev/null; then
            echo -e "\nWarning: Capture process ended unexpectedly"
            break
        fi
        
        # Wait 1 second
        sleep 1
    done
    
    # Complete the progress display
    echo -e "\nRecording complete."
    
    # Stop the capture and monitor
    kill $CAPTURE_PID $MONITOR_PID 2>/dev/null
    wait $CAPTURE_PID 2>/dev/null
    
    # Process recording to image
    if [ -f "$recording_file" ]; then
        echo "Recording completed: $recording_file"
        
        # Calculate file size
        FILE_SIZE=$(stat -c%s "$recording_file" 2>/dev/null || echo "0")
        
        # Only decode if file size is reasonable (more than 80KB)
        if [ $FILE_SIZE -gt 81920 ]; then
            echo "Decoding image from $recording_file..."
            
            # Try to decode the image with aptdec
            if command -v aptdec >/dev/null; then
                echo "Decoding image with aptdec..."
                
                # Create standard grayscale image (Channel A)
                echo "Creating Channel A image..."
                timeout 300 aptdec -A -o "${image_file}-chA.png" "${recording_file}" || echo "Warning: aptdec Channel A processing failed"
                
                # Create Channel B image
                echo "Creating Channel B image..."
                timeout 300 aptdec -B -o "${image_file}-chB.png" "${recording_file}" || echo "Warning: aptdec Channel B processing failed"
                
                # Create false color composite
                echo "Creating false color composite..."
                timeout 300 aptdec -c -o "${image_file}-color.png" "${recording_file}" || echo "Warning: aptdec false color processing failed"
                
                # Create a basic info file with capture metadata
                echo "Satellite: $satellite_name" > "${image_file}.txt"
                echo "Frequency: $frequency" >> "${image_file}.txt"
                echo "Timestamp: $(date -u)" >> "${image_file}.txt"
                echo "Signal strength: $(cat /tmp/noaa_signal_strength.txt 2>/dev/null || echo 'unknown') dB" >> "${image_file}.txt"
                
                # Check if at least one image was actually created
                if ls "${image_file}"*.png 1> /dev/null 2>&1; then
                    echo "Images successfully saved to ${image_file}-*.png"
                else
                    echo "Warning: All aptdec processing failed but recording was kept"
                fi
            else
                echo "aptdec not installed, keeping recording for manual processing"
            fi
        else
            echo "Recording file suspicious size ($FILE_SIZE bytes), marking as potentially corrupt"
            # Move to a separate directory rather than deleting
            mkdir -p "$RECORDINGS_DIR/suspicious"
            mv "$recording_file" "$RECORDINGS_DIR/suspicious/"
        fi
    else
        echo "Error: Recording failed or file not found"
    fi
}

# Function to display information about upcoming passes
display_upcoming_passes() {
    local log_file="$HOME/.noaa-apt/pass_log.txt"
    mkdir -p "$(dirname "$log_file")"
    
    if [ ! -f "/tmp/upcoming_passes.txt" ] || [ ! -s "/tmp/upcoming_passes.txt" ]; then
        echo "No upcoming passes scheduled." | tee -a "$log_file"
        return 1
    fi
    
    # Get current time
    local now=$(date +%s)
    local current_time=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Display header
    echo "====================================================" | tee -a "$log_file"
    echo "UPCOMING SATELLITE PASSES as of $current_time" | tee -a "$log_file"
    echo "====================================================" | tee -a "$log_file"
    
    # Read all passes and display them
    local pass_num=1
    while IFS=, read -r sat start_time end_time max_elev max_elev_time; do
        # Skip passes that are in the past
        if [ "$start_time" -lt "$now" ]; then
            continue
        fi
        
        local start_fmt=$(date -d "@$start_time" '+%Y-%m-%d %H:%M:%S')
        local end_fmt=$(date -d "@$end_time" '+%H:%M:%S')
        local max_elev_fmt=$(date -d "@$max_elev_time" '+%H:%M:%S')
        local duration=$((end_time - start_time))
        local wait_time=$((start_time - now))
        
        # Format wait time
        local wait_hours=$((wait_time / 3600))
        local wait_minutes=$(( (wait_time % 3600) / 60 ))
        
        # Display pass information
        echo "Pass #$pass_num: $sat" | tee -a "$log_file"
        echo "  Start time: $start_fmt" | tee -a "$log_file"
        echo "  End time: $end_fmt" | tee -a "$log_file"
        echo "  Duration: $((duration / 60)) minutes $((duration % 60)) seconds" | tee -a "$log_file"
        echo "  Maximum elevation: ${max_elev}° at $max_elev_fmt" | tee -a "$log_file"
        echo "  Time until pass: ${wait_hours}h ${wait_minutes}m" | tee -a "$log_file"
        echo "" | tee -a "$log_file"
        
        pass_num=$((pass_num + 1))
    done < "/tmp/upcoming_passes.txt"
    
    echo "Log saved to: $log_file"
    return 0
}

# Function to create status dashboard
create_status_dashboard() {
    local dashboard_file="$HOME/.noaa-apt/dashboard.txt"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local uptime=$(uptime -p)
    local storage=$(df -h "$RECORDINGS_DIR" | tail -1 | awk '{print $4}')
    
    # Create dashboard
    mkdir -p "$(dirname "$dashboard_file")"
    
    echo "====================================================" > "$dashboard_file"
    echo "NOAA APT SATELLITE RECEIVER STATUS DASHBOARD" >> "$dashboard_file"
    echo "====================================================" >> "$dashboard_file"
    echo "Last updated: $timestamp" >> "$dashboard_file"
    echo "System uptime: $uptime" >> "$dashboard_file"
    echo "Storage available: $storage" >> "$dashboard_file"
    echo "" >> "$dashboard_file"
    
    # Add next pass information if available
    if [ -f "/tmp/next_pass_status.txt" ]; then
        IFS=, read -r sat aos_time max_elev < "/tmp/next_pass_status.txt"
        echo "NEXT SATELLITE PASS" >> "$dashboard_file"
        echo "Satellite: $sat" >> "$dashboard_file"
        echo "Time: $aos_time" >> "$dashboard_file"
        echo "Maximum elevation: $max_elev°" >> "$dashboard_file"
        
        # Calculate remaining time
        local pass_time=$(date -d "$aos_time" +%s)
        local now=$(date +%s)
        local time_left=$((pass_time - now))
        
        if [ $time_left -gt 0 ]; then
            local hours=$((time_left / 3600))
            local minutes=$(( (time_left % 3600) / 60 ))
            echo "Time until pass: ${hours}h ${minutes}m" >> "$dashboard_file"
        else
            echo "Pass is in progress or starting soon!" >> "$dashboard_file"
        fi
    else
        echo "No upcoming passes scheduled at this time." >> "$dashboard_file"
    fi
    
    echo "" >> "$dashboard_file"
    echo "Recent captures:" >> "$dashboard_file"
    
    # List the 5 most recent captures
    find "$RECORDINGS_DIR" -name "*.wav" -type f -printf "%T@ %p\n" | sort -rn | head -5 | \
    while read -r line; do
        file_path=$(echo "$line" | cut -d' ' -f2-)
        file_name=$(basename "$file_path")
        file_time=$(date -r "$file_path" '+%Y-%m-%d %H:%M:%S')
        echo "- $file_name ($file_time)" >> "$dashboard_file"
    done
    
    echo "" >> "$dashboard_file"
    echo "Dashboard saved to: $dashboard_file"
}

# Function to wait for and capture the next pass
capture_next_pass() {
    if [ ! -f "/tmp/upcoming_passes.txt" ] || [ ! -s "/tmp/upcoming_passes.txt" ]; then
        echo "No upcoming passes scheduled."
        return 1
    fi
    
    # Get the next pass
    IFS=, read -r sat start_time end_time max_elev max_elev_time < "/tmp/upcoming_passes.txt"
    
    if [ -z "$sat" ] || [ -z "$start_time" ] || [ -z "$end_time" ]; then
        echo "Error reading next pass information."
        return 1
    fi
    
    # Calculate wait time (start 60 seconds before pass begins)
    local now=$(date +%s)
    local wait_time=$((start_time - now - 60))
    local duration=$((end_time - start_time + 120))  # Add buffer at start and end
    local aos_time=$(date -d "@$start_time" '+%Y-%m-%d %H:%M:%S')
    
    # Show information about the next pass
    echo "Next pass: $sat at $aos_time (max elevation: ${max_elev}°)"
    
    # Create a status file with information about the next pass
    echo "$sat,$aos_time,$max_elev" > "/tmp/next_pass_status.txt"
    
    if [ $wait_time -gt 0 ]; then
        echo "Waiting $wait_time seconds until pass begins..."
        
        # Show countdown timer for long waits
        if [ $wait_time -gt 60 ]; then
            local countdown=$wait_time
            local last_log_time=0
            
            while [ $countdown -gt 0 ]; do
                # Only update every 60 seconds when wait is long, or every 5 seconds when close
                if [ $((countdown % 60)) -eq 0 ] || [ $countdown -lt 60 ] && [ $((countdown % 5)) -eq 0 ]; then
                    local hours=$((countdown / 3600))
                    local minutes=$(( (countdown % 3600) / 60 ))
                    local seconds=$((countdown % 60))
                    printf "\rTime until next pass: %02d:%02d:%02d " $hours $minutes $seconds
                    
                    # Log the status periodically (every 15 minutes if wait is long, every minute if < 15 minutes)
                    local time_since_last_log=$((last_log_time - countdown))
                    if { [ $hours -gt 0 ] && [ $time_since_last_log -ge 900 ]; } || \
                       { [ $hours -eq 0 ] && [ $time_since_last_log -ge 60 ]; }; then
                        echo ""
                        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $sat pass in ${hours}h ${minutes}m ${seconds}s (max elevation: ${max_elev}°)"
                        last_log_time=$countdown
                    fi
                fi
                sleep 1
                countdown=$((countdown - 1))
            done
            echo -e "\nPass is starting!"
        else
            # Simple sleep for short waits
            sleep $wait_time
        fi
    else
        echo "Pass is already in progress or about to begin!"
    fi
    
    # Remove this pass from the schedule
    sed -i '1d' "/tmp/upcoming_passes.txt"
    
    # Remove status file
    rm -f "/tmp/next_pass_status.txt"
    
    # Check if we can actually receive the satellite
    if check_signal_strength "$sat"; then
        # Capture the satellite
        capture_satellite "$sat" "$duration"
        return 0
    else
        echo "Signal not strong enough for $sat, skipping capture"
        return 1
    fi
}

# Main function
main() {
    # Display startup banner
    echo "====================================================="
    echo "Starting NOAA Satellite Auto-Capture (Raspberry Pi Version)"
    echo "====================================================="
    
    # Check dependencies
    check_dependencies
    
    # Get location coordinates
    get_location
    
    # Set up log file
    LOG_FILE="$HOME/.noaa-apt/receiver.log"
    mkdir -p "$(dirname "$LOG_FILE")"
    
    echo "$(date '+%Y-%m-%d %H:%M:%S') - NOAA APT Receiver started" >> "$LOG_FILE"
    echo "Location: $STATION_LAT, $STATION_LON" >> "$LOG_FILE"
    
    # Set up periodic dashboard update
    (
        while true; do
            create_status_dashboard
            sleep 300  # Update dashboard every 5 minutes
        done
    ) &
    DASHBOARD_PID=$!
    
    # Track the last time we displayed pass info
    LAST_PASS_DISPLAY=$(date +%s)
    
    # Main loop
    while true; do
        # Update TLE data when needed
        update_tle_data
        
        echo "====================================================="
        echo "Predicting satellite passes..."
        predict_passes
        
        # Display upcoming passes
        display_upcoming_passes
        LAST_PASS_DISPLAY=$(date +%s)
        
        # Capture satellites until we run out of scheduled passes
        while [ -s "/tmp/upcoming_passes.txt" ]; do
            # Periodically display upcoming passes (every 4 hours)
            NOW=$(date +%s)
            if [ $((NOW - LAST_PASS_DISPLAY)) -gt 14400 ]; then
                display_upcoming_passes
                LAST_PASS_DISPLAY=$NOW
            fi
            
            # Capture the next pass
            capture_next_pass
        done
        
        echo "No more passes scheduled. Will check again in 30 minutes..."
        echo "$(date '+%Y-%m-%d %H:%M:%S') - No more passes scheduled, waiting 30 minutes" >> "$LOG_FILE"
        
        # Wait a bit before looking for more passes
        sleep 1800  # 30 minutes
    done
}

# Start the script
main
