import asyncio
from kasa import Discover

# --- CONFIGURATION ---
TAPO_EMAIL = "alyssa.lueking@gmail.com"
TAPO_PASSWORD = "developer123"
TAPO_IP = "192.168.0.120" # Keeping your verified terminal IP!

async def main():
    try:
        # Added discovery_timeout parameters to bypass Windows UDP network drops
        dev = await Discover.discover_single(
            TAPO_IP, 
            username=TAPO_EMAIL, 
            password=TAPO_PASSWORD,
            discovery_timeout=10
        )
        await dev.update()
        print("ON" if dev.is_on else "OFF")
    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())