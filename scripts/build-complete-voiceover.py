import asyncio
import os
import subprocess
import time
import edge_tts

OUTPUT_DIR = "d:/Airlock/recordings/audio"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Primary voice: Microsoft Andrew (natural, warm, confident)
PRIMARY_VOICE = "en-US-AndrewMultilingualNeural"
FALLBACK_VOICE = "en-US-GuyNeural"

CLIPS = [
    {
        "id": "scene1_overview",
        "target_start": 0.5,
        "text": "Welcome to Airlock, the financial safety gateway for AI agents. Here on the overview, we see real-time health and telemetry from our live PayPal Sandbox payment rail."
    },
    {
        "id": "scene2_auto_approve",
        "target_start": 13.0,
        "text": "An AI agent requests a low-risk twelve-fifty refund. Airlock evaluates the policy in under two milliseconds. Meeting all auto-approval criteria, it evaluates to ALLOW and executes live on PayPal."
    },
    {
        "id": "scene3_injection_defense",
        "target_start": 32.5,
        "text": "Here, an attacker injects a prompt injection payload into the refund reason, attempting to force a one-hundred-twenty dollar payout. Airlock halts the operation and quarantines it for security review."
    },
    {
        "id": "scene4a_dual_control_queue",
        "target_start": 47.5,
        "text": "For high-value requests like this one hundred fifty dollar refund, dual-control approval is enforced. Notice that the requesting agent cannot self-approve; the action is held for human review."
    },
    {
        "id": "scene4b_manager_signoff",
        "target_start": 62.5,
        "text": "Switching to Manager Dave. He inspects the claim in the approval queue and authorizes execution, securely releasing the refund on the live payment rail."
    },
    {
        "id": "scene5_audit_trail",
        "target_start": 74.0,
        "text": "In the Audit Timeline, every transaction and state change is cryptographically hashed with SHA-256, creating a verifiable, immutable compliance trail."
    },
    {
        "id": "scene6_safety_lab",
        "target_start": 86.0,
        "text": "In the Safety Lab, Airlock is stress-tested against red-team attack vectors, maintaining one hundred percent boundary accuracy."
    },
    {
        "id": "scene7_8_render_outro",
        "target_start": 95.5,
        "text": "Finally, here is our live production deployment on Render, connected to real payment rails. Airlock gives AI agents speed, backed by institutional financial safety."
    }
]

def generate_sapi_fallback(text, out_wav):
    """Fallback using built-in Windows System.Speech"""
    escaped = text.replace('"', '`"')
    ps_cmd = f'''
    Add-Type -AssemblyName System.Speech
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Male)
    $s.SetOutputToWaveFile("{out_wav}")
    $s.Speak("{escaped}")
    $s.Dispose()
    '''
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd], check=True)

async def generate_with_retry(clip):
    out_mp3 = os.path.join(OUTPUT_DIR, f"{clip['id']}.mp3")
    
    # Check if already exists and is valid
    if os.path.exists(out_mp3) and os.path.getsize(out_mp3) > 1000:
        res = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out_mp3],
            capture_output=True, text=True
        )
        try:
            dur = float(res.stdout.strip())
            print(f"Already generated: {clip['id']} ({dur:.2f}s)")
            return {**clip, "duration": dur, "file": out_mp3}
        except Exception:
            pass

    for attempt in range(1, 4):
        voice = PRIMARY_VOICE if attempt < 3 else FALLBACK_VOICE
        print(f"Generating {clip['id']} (attempt {attempt}, voice {voice})...")
        try:
            communicate = edge_tts.Communicate(clip["text"], voice, rate="+4%")
            await communicate.save(out_mp3)
            time.sleep(1.0) # avoid rate limit
            
            res = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out_mp3],
                capture_output=True, text=True
            )
            dur = float(res.stdout.strip())
            print(f"  SUCCESS: {clip['id']} -> {dur:.2f}s")
            return {**clip, "duration": dur, "file": out_mp3}
        except Exception as e:
            print(f"  Attempt {attempt} failed: {e}")
            await asyncio.sleep(2.0)

    # Fallback to Windows SAPI
    print(f"  Falling back to Windows SAPI for {clip['id']}...")
    out_wav = os.path.join(OUTPUT_DIR, f"{clip['id']}.wav")
    generate_sapi_fallback(clip["text"], out_wav)
    # convert wav to mp3
    subprocess.run(["ffmpeg", "-y", "-i", out_wav, "-c:a", "libmp3lame", "-q:a", "2", out_mp3], check=True)
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out_mp3],
        capture_output=True, text=True
    )
    dur = float(res.stdout.strip())
    return {**clip, "duration": dur, "file": out_mp3}

async def main():
    results = []
    for c in CLIPS:
        res = await generate_with_retry(c)
        results.append(res)
        await asyncio.sleep(0.5)

    print("\n" + "="*60)
    print(" TIMELINE VERIFICATION")
    print("="*60)
    for i, r in enumerate(results):
        end = r["target_start"] + r["duration"]
        next_start = results[i+1]["target_start"] if i+1 < len(results) else 106.7
        gap = next_start - end
        status = "OK" if gap >= 0 else f"OVERLAP by {-gap:.1f}s!"
        print(f"[{r['target_start']:5.1f}s - {end:5.1f}s] {r['id']:<25} (dur: {r['duration']:4.1f}s, gap: {gap:4.1f}s) -> {status}")

    # Now composite the full 106.72s audio track using ffmpeg
    print("\nCompositing audio track with exact timeline synchronization...")
    # Using ffmpeg adelay and amix
    inputs = []
    filter_parts = []
    
    for i, r in enumerate(results):
        inputs.extend(["-i", r["file"]])
        delay_ms = int(r["target_start"] * 1000)
        filter_parts.append(f"[{i}]adelay={delay_ms}|{delay_ms}[a{i}]")

    amix_inputs = "".join(f"[a{i}]" for i in range(len(results)))
    filter_complex = f"{';'.join(filter_parts)};{amix_inputs}amix=inputs={len(results)}:duration=longest:normalize=0[aout]"
    
    full_audio_wav = "d:/Airlock/recordings/audio/full_narration.wav"
    cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", filter_complex, "-map", "[aout]", "-ac", "2", "-ar", "48000", full_audio_wav]
    
    print("Running ffmpeg audio composite...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("Composite error:", res.stderr)
        return
    
    print(f"Full narration track created: {full_audio_wav}")

    # Verify duration
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", full_audio_wav],
        capture_output=True, text=True
    )
    print(f"Audio track duration: {float(res.stdout.strip()):.2f}s (Video is 106.72s)")

    # Multiplex with video into final mp4
    input_video = "d:/Airlock/recordings/airlock-product-walkthrough.mp4"
    final_video = "d:/Airlock/recordings/airlock-product-walkthrough-narrated.mp4"
    
    print(f"\nMuxing narration into final video: {final_video}...")
    mux_cmd = [
        "ffmpeg", "-y",
        "-i", input_video,
        "-i", full_audio_wav,
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        final_video
    ]
    res = subprocess.run(mux_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("Muxing error:", res.stderr)
        return
        
    print(f"\nSUCCESS! Narrated video created: {final_video}")

if __name__ == "__main__":
    asyncio.run(main())

