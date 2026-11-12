import asyncio
import os
import subprocess
import edge_tts

VOICE = "en-US-AndrewMultilingualNeural" # Professional, warm, confident, authentic
OUTPUT_DIR = "d:/Airlock/recordings/audio"
os.makedirs(OUTPUT_DIR, exist_ok=True)

CLIPS = [
    {
        "id": "scene1_overview",
        "target_start": 0.5,
        "text": "Welcome to Airlock, the financial safety gateway for autonomous AI agents. We begin on the dashboard overview, featuring real-time telemetry from our live PayPal Sandbox payment rail."
    },
    {
        "id": "scene2_auto_approve",
        "target_start": 10.5,
        "text": "Here, an AI support agent initiates a low-risk twelve dollar and fifty cent refund. Airlock's policy engine and Jev decision model evaluate the business context in under two milliseconds. Because it satisfies all safety limits and policy checks, the request evaluates to ALLOW, and executes immediately on the live PayPal payment rail."
    },
    {
        "id": "scene3_injection_defense",
        "target_start": 32.5,
        "text": "Now, let's observe an adversarial attack. A malicious prompt injection attempts to hijack the system and force an unauthorized one hundred and twenty dollar payout. Airlock's zero-trust inspection intercepts the prompt injection vector, blocking the attack and quarantining the operation."
    },
    {
        "id": "scene4_dual_control",
        "target_start": 48.5,
        "text": "For high-value requests like this one hundred and forty-nine dollar refund, Airlock enforces dual-control approval. Under strict separation of duties, the requesting agent cannot self-approve. The request is routed to the human manager queue, where Manager Dave inspects the claim and authorizes execution."
    },
    {
        "id": "scene5_audit_trail",
        "target_start": 75.0,
        "text": "Next, in the Audit Timeline, every state transition, policy check, and processor response is cryptographically linked with SHA-256 hashes, producing a verifiable audit trail for compliance and regulators."
    },
    {
        "id": "scene6_safety_lab",
        "target_start": 87.5,
        "text": "In the Safety Lab, Airlock is continuously benchmarked against red-team attacks, including prompt injections, velocity smurfing, and social engineering coercion, maintaining one hundred percent boundary accuracy."
    },
    {
        "id": "scene7_8_render_outro",
        "target_start": 96.5,
        "text": "Finally, here is our live production deployment on Render, connected to real payment rails. Airlock gives AI agents the speed they need, backed by institutional financial safety."
    }
]

async def generate_clip(clip):
    out_file = os.path.join(OUTPUT_DIR, f"{clip['id']}.mp3")
    print(f"Generating {clip['id']}...")
    communicate = edge_tts.Communicate(clip["text"], VOICE, rate="+3%")
    await communicate.save(out_file)
    
    # Check duration using ffprobe
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out_file],
        capture_output=True, text=True
    )
    dur = float(res.stdout.strip())
    print(f"  Saved {out_file} (duration: {dur:.2f}s, target start: {clip['target_start']}s)")
    return {**clip, "duration": dur, "file": out_file}

async def main():
    results = []
    for c in CLIPS:
        res = await generate_clip(c)
        results.append(res)
        
    print("\nTIMELINE CHECK:")
    for i, r in enumerate(results):
        end = r["target_start"] + r["duration"]
        next_start = results[i+1]["target_start"] if i+1 < len(results) else 106.7
        gap = next_start - end
        status = "OK" if gap >= 0 else "OVERLAP!"
        print(f"[{r['target_start']:5.1f}s - {end:5.1f}s] {r['id']:<25} (gap to next: {gap:4.1f}s) -> {status}")

if __name__ == "__main__":
    asyncio.run(main())

