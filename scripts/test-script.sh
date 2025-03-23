#!/bin/bash

# NOAA Weather Satellite Auto-Capture Script (aptdec Version)
# --------------------------------------------------------------
# Dependencies: rtl-sdr, sox, aptdec
# Install with: apt-get install rtl-sdr sox
# For aptdec: git clone https://github.com/csete/aptdec.git && cd aptdec && make && sudo make install

# Configuration
GAIN=45                   # RTL-SDR gain setting (adjust as needed)
SAMPLE_RATE=48000         # Sample rate for rtl_fm
RECORDINGS_DIR="$HOME/noaa-recordings"  # Directory to save recordings
IMAGES_DIR="$HOME/noaa-images"          # Directory to save decoded images
SCAN_INTERVAL=180         # Time in seconds between frequency scans
RECORD_DURATION=900       # Recording duration in seconds (15 minutes)
MIN_SIGNAL_STRENGTH=-30   # Minimum signal strength in dB to begin recording

# Create all required directories and ensure proper permissions
mkdir -p "$RECORDINGS_DIR"
mkdir -p "$IMAGES_DIR"
mkdir -p "/tmp/noaa-processing"

# Ensure directories are writable
chmod -R 755 "$RECORDINGS_DIR"
chmod -R 755 "$IMAGES_DIR"
chmod -R 755 "/tmp/noaa-processing"

# Display directory status
echo "Storage directories prepared:"
echo "- Recordings: $RECORDINGS_DIR ($(df -h "$RECORDINGS_DIR" | tail -1 | awk '{print $4}') free)"
echo "- Images: $IMAGES_DIR ($(df -h "$IMAGES_DIR" | tail -1 | awk '{print $4}') free)"

# NOAA satellite information
declare -A FREQUENCIES
FREQUENCIES["NOAA-15"]="137.6125M"
FREQUENCIES["NOAA-18"]="137.9125M"
FREQUENCIES["NOAA-19"]="137.1000M"

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
    
    # Extract and average signal strength
    SIGNAL=$(cat /tmp/power_scan.csv | awk -F, '{sum+=$7} END {print sum/NR}')
    NOISE_FLOOR=-70  # Adjust this threshold based on your environment
    
    echo "$satellite_name signal strength: $SIGNAL dB"
    
    # Compare with noise floor
    if (( $(echo "$SIGNAL > $NOISE_FLOOR" | bc -l) )); then
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
    local timestamp=$(date -u +"%Y%m%d-%H%M%S")
    local recording_file="$RECORDINGS_DIR/${satellite_name}-${timestamp}.wav"
    local image_file="$IMAGES_DIR/${satellite_name}-${timestamp}"
    
    echo "Starting capture of $satellite_name at $frequency"
    
    # Start a background process to monitor signal strength during recording
    echo "-100" > /tmp/noaa_signal_strength.txt
    (
        while true; do
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
            else
                # If file doesn't exist, just keep the last reading
                echo "No new reading" > /dev/null
            fi
            sleep 3
        done
    ) &
    MONITOR_PID=$!
    
    # Prepare for progress display
    echo "" > /tmp/noaa_progress_bar.txt
    
    # Capture the signal directly to WAV file
    rtl_fm -f $frequency -s $SAMPLE_RATE -g $GAIN -p 0 -E deemp -F 9 - 2>/dev/null | \
    sox -t raw -r $SAMPLE_RATE -e s -b 16 -c 1 - "$recording_file" rate 11025 &
    
    # Save the PID of the background process
    CAPTURE_PID=$!
    
    # Let it run for the specified duration with progress display
    echo "Recording for $RECORD_DURATION seconds..."
    
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
    for (( elapsed=1; elapsed<=$RECORD_DURATION; elapsed++ )); do
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
        show_progress $elapsed $RECORD_DURATION $current_strength
        
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
    
    # Ensure recording directory exists before checking file
    mkdir -p "$RECORDINGS_DIR"
    
    # Create images directory if it doesn't exist
    mkdir -p "$IMAGES_DIR"
    
    # Collect signal strength statistics with error handling
    echo -e "\nSignal strength statistics during capture:"
    
    if [ -f "/tmp/noaa_signal_strength.txt" ]; then
        # Try to read the value with fallback
        signal_value=$(cat /tmp/noaa_signal_strength.txt 2>/dev/null || echo "-100")
        
        # Validate that we have a numerical value
        if [[ $signal_value =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then
            MIN_STRENGTH=$signal_value
            MAX_STRENGTH=$signal_value
            SUM_STRENGTH=$signal_value
            COUNT=1
            
            echo "  Peak signal: ${MAX_STRENGTH} dB"
            echo "  Minimum signal: ${MIN_STRENGTH} dB"
            echo "  Average signal: ${SUM_STRENGTH} dB"
        else
            echo "  Could not collect valid signal statistics"
        fi
    else
        echo "  No signal strength data available"
    fi
    
    # Multiple checks to ensure we don't lose recordings
    if [ -f "$recording_file" ]; then
        echo "Recording completed: $recording_file"
        
        # Calculate file size
        FILE_SIZE=$(stat -c%s "$recording_file" 2>/dev/null || echo "0")
        
        # Only decode if file size is reasonable (more than 80KB to be more lenient)
        if [ $FILE_SIZE -gt 81920 ]; then
            echo "Decoding image from $recording_file..."
            
            # Backup recording file in case processing fails
            cp "$recording_file" "/tmp/noaa-processing/backup-$(basename "$recording_file")" 2>/dev/null
            
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
                
                # Check if at least one image was actually created
                if ls "${image_file}"*.png 1> /dev/null 2>&1; then
                    echo "Images successfully saved to ${image_file}-*.png"
                else
                    echo "Warning: All aptdec processing failed but recording was kept"
                fi
            else
                echo "aptdec not installed, keeping recording for manual processing"
            fi
            
            # Create a basic info file with capture metadata
            echo "Satellite: $satellite_name" > "${image_file}.txt"
            echo "Frequency: $frequency" >> "${image_file}.txt"
            echo "Timestamp: $(date -u)" >> "${image_file}.txt"
            echo "Signal strength: $(cat /tmp/best_signal.txt | cut -d' ' -f1) dB" >> "${image_file}.txt"
            
        else
            echo "Recording file suspicious size ($FILE_SIZE bytes), but keeping it anyway"
            # Move to a separate directory rather than deleting
            mkdir -p "$RECORDINGS_DIR/suspicious"
            mv "$recording_file" "$RECORDINGS_DIR/suspicious/"
        fi
    else
        echo "Error: Recording failed or file not found"
        
        # Check for any partial recordings that might have been created
        partial_files=$(find "$RECORDINGS_DIR" -name "*${satellite_name}*${timestamp}*" 2>/dev/null)
        if [ ! -z "$partial_files" ]; then
            echo "Found potential partial recordings: $partial_files"
            # Attempt to process these files
            for partial in $partial_files; do
                echo "Attempting to process partial recording: $partial"
                if [ -f "$partial" ] && [ $(stat -c%s "$partial" 2>/dev/null || echo "0") -gt 81920 ]; then
                    if command -v aptdec >/dev/null; then
                        echo "Attempting to process partial recording with aptdec: $partial"
                        partial_base="${IMAGES_DIR}/partial-$(basename "$partial" .wav)"
                        timeout 300 aptdec -o "${partial_base}.png" "$partial" || echo "Warning: partial processing failed"
                    else
                        echo "aptdec not installed, keeping partial recording for manual processing"
                    fi
                fi
            done
        fi
    fi
}

# Function to scan all frequencies
scan_all_satellites() {
    # Create temporary file for best signal
    echo "-100 none" > /tmp/best_signal.txt
    
    # Check each satellite
    for satellite in "${!FREQUENCIES[@]}"; do
        frequency="${FREQUENCIES[$satellite]}"
        
        echo "Scanning $satellite at $frequency..."
        
        # Extract numeric part of frequency (removing 'M' suffix)
        freq_num=${frequency%M}
        # Calculate upper frequency bound (add 1MHz for scanning range)
        freq_upper=$(echo "$freq_num + 1" | bc)
        
        # Use rtl_power to check signal strength
        rtl_power -f ${freq_num}M:${freq_upper}M:25k -g $GAIN -i 1 -e 5s /tmp/power_scan.csv
        
        # Extract and average signal strength
        SIGNAL=$(cat /tmp/power_scan.csv | awk -F, '{sum+=$7} END {print sum/NR}')
        echo "$satellite signal strength: $SIGNAL dB"
        
        # Compare with current best signal
        BEST_SIGNAL=$(cat /tmp/best_signal.txt | cut -d' ' -f1)
        if (( $(echo "$SIGNAL > $BEST_SIGNAL" | bc -l) )); then
            echo "$SIGNAL $satellite" > /tmp/best_signal.txt
        fi
    done
    
    # Read the best signal
    BEST_SIGNAL=$(cat /tmp/best_signal.txt | cut -d' ' -f1)
    BEST_SATELLITE=$(cat /tmp/best_signal.txt | cut -d' ' -f2)
    
    # Threshold for minimum signal
    NOISE_FLOOR=$MIN_SIGNAL_STRENGTH  # Use the user-defined minimum signal threshold
    
    if [ "$BEST_SATELLITE" != "none" ] && (( $(echo "$BEST_SIGNAL > $NOISE_FLOOR" | bc -l) )); then
        echo "Best signal: $BEST_SATELLITE at $BEST_SIGNAL dB (above threshold of $NOISE_FLOOR dB)"
        return 0  # Found a good signal
    else
        if [ "$BEST_SATELLITE" != "none" ]; then
            echo "Best signal was $BEST_SATELLITE at $BEST_SIGNAL dB, but below threshold of $NOISE_FLOOR dB"
        else
            echo "No signals found"
        fi
        return 1  # No good signals
    fi
}

# Ensure we have the necessary tools installed
check_dependencies() {
    local missing=0
    
    # Check for rtl_fm
    if ! command -v rtl_fm &> /dev/null; then
        echo "WARNING: rtl_fm not found. Please install rtl-sdr package."
        missing=1
    fi
    
    # Check for rtl_power
    if ! command -v rtl_power &> /dev/null; then
        echo "WARNING: rtl_power not found. Please install rtl-sdr package."
        missing=1
    fi
    
    # Check for sox
    if ! command -v sox &> /dev/null; then
        echo "WARNING: sox not found. Please install sox package."
        missing=1
    fi
    
    # Check for bc
    if ! command -v bc &> /dev/null; then
        echo "WARNING: bc not found. Please install bc package."
        missing=1
    fi
    
    # Check for aptdec
    if ! command -v aptdec &> /dev/null; then
        echo "WARNING: aptdec not found. Please install aptdec."
        echo "         Recordings will be saved but not decoded to images."
        missing=1
    fi
    
    if [ $missing -eq 1 ]; then
        echo "Missing some dependencies, but will attempt to continue anyway."
        sleep 3
    fi
}

# Check dependencies before starting
check_dependencies

# Verify RTL-SDR device is connected
if ! rtl_test -t 2>/dev/null; then
    echo "WARNING: RTL-SDR device test failed. Check if device is connected properly."
    echo "Will continue anyway in case device is just busy..."
fi

# Main loop - continuously scan frequencies and capture when signal is detected
echo "====================================================="
echo "Starting NOAA satellite monitor (Signal-Filtered Version)..."
echo "Monitoring satellites: ${!FREQUENCIES[@]}"
echo "Recordings will be saved to: $RECORDINGS_DIR"
echo "Images will be saved to: $IMAGES_DIR"
echo "Minimum signal strength: $MIN_SIGNAL_STRENGTH dB"
echo "Press Ctrl+C to exit"
echo "====================================================="

while true; do
    timestamp=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    echo "[$timestamp] Scanning for satellite signals..."
    
    # Install bc if not available
    if ! command -v bc &> /dev/null; then
        echo "bc is required but not installed. Attempting to install..."
        sudo apt-get update && sudo apt-get install -y bc
    fi
    
    # Scan all satellites and find the best signal
    if scan_all_satellites; then
        BEST_SATELLITE=$(cat /tmp/best_signal.txt | cut -d' ' -f2)
        
        # Capture the best satellite
        capture_satellite "$BEST_SATELLITE"
        
        # Wait a bit before scanning again
        echo "Waiting $SCAN_INTERVAL seconds before next scan..."
        sleep $SCAN_INTERVAL
    else
        echo "No satellites with good signal found. Waiting..."
        sleep 60  # Check again in 1 minute
    fi
done
