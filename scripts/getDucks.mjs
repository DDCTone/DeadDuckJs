import * as dotenv from 'dotenv';
// Using the Alchemy SDK
import { Alchemy, Network } from "alchemy-sdk";
import fs from 'fs/promises'
import path from 'path'

dotenv.config();

// Configure the Alchemy SDK
const settings = {
    apiKey: process.env.ALCHEMY_APIKEY, // Your API key
    network: Network.ETH_MAINNET,
};

const alchemy = new Alchemy(settings);

async function getAllNFTsInCollection() {
    // Your collection contract address
    const contractAddress = "0xd66c8af378627844c36b8d65bf88c08e03e853ce";

    const options = {
        omitMetadata: false
    };

    // Get all NFTs in the collection with pagination
    let allNfts = [];
    let pageKey = null;

    do {
        // If we have a pageKey, add it to options
        if (pageKey) {
            options.pageKey = pageKey;
        }

        const response = await alchemy.nft.getNftsForContract(contractAddress, options);
        const { nfts } = response;

        // Add this batch to our collection
        allNfts = [...allNfts, ...nfts];

        // Update pageKey for next iteration
        pageKey = response.pageKey;

        console.log(`Fetched batch of ${nfts.length} NFTs. Total so far: ${allNfts.length}`);
    } while (pageKey);

    console.log(`Found ${allNfts.length} total NFTs in collection`);

    // Create an array with just the data we care about
    const nftData = allNfts.map(nft => {
        return {
            tokenId: nft.tokenId,
            name: nft.name || nft.title,
            image: nft.image?.originalUrl || nft.image?.cachedUrl || 'No image available',
            attributes: nft.raw?.metadata?.attributes || []
        };
    });

    // Output the first few as a sample
    console.log("Sample of processed NFT data:");
    console.log(JSON.stringify(nftData.slice(0, 3), null, 2));

    // Optional: save to file
    // const fs = require('fs');
    // fs.writeFileSync('dead_ducks_data.json', JSON.stringify(nftData, null, 2));

    return nftData;
}

// Helper function to extract IPFS hash from URL
function extractIpfsHash(url) {
    // Handle ipfs:// protocol
    if (url.startsWith('ipfs://')) {
        return url.substring(7);
    }
    
    // Handle gateway URLs like https://ipfs.io/ipfs/QmHash
    const match = url.match(/\/ipfs\/([a-zA-Z0-9]+)/);
    if (match && match[1]) {
        return match[1];
    }
    
    return null;
}

async function downloadDuckImage(duck) {
    const tokenId = duck.tokenId;
    const imageUrl = duck.image;

    if (!imageUrl) {
        console.log(`No image URL for Duck #${tokenId}, skipping`);
        return null;
    }

    // Create images directory if it doesn't exist
    const imageDir = path.join(process.cwd(), 'public', 'images', 'ducks');
    try {
        await fs.access(imageDir);
    } catch {
        await fs.mkdir(imageDir, { recursive: true });
        console.log(`Created directory: ${imageDir}`);
    }

    // Set the image file path
    const imagePath = path.join(imageDir, `${tokenId}.webp`);
    const relativePath = `/images/ducks/${tokenId}.webp`;

    // Check if image already exists
    try {
        await fs.access(imagePath);
        console.log(`Image for Duck #${tokenId} already exists, skipping download`);
        return { localPath: relativePath, success: true };
    } catch {
        // File doesn't exist, continue with download
    }

    // Function to delay execution
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    // Multiple IPFS gateways to try
    let gateways = [
        { url: imageUrl, isOriginal: true },  // Original URL first
    ];
    
    // If it's an IPFS URL, add alternative gateways
    const ipfsHash = extractIpfsHash(imageUrl);
    if (ipfsHash) {
        const ipfsPath = imageUrl.includes('.webp') ? `${ipfsHash}/${tokenId}.webp` : ipfsHash;
        
        // Add multiple fallback gateways - these are some of the more reliable public gateways
        gateways = gateways.concat([
            { url: `https://cloudflare-ipfs.com/ipfs/${ipfsPath}`, name: "Cloudflare" },
            { url: `https://ipfs.dweb.link/ipfs/${ipfsPath}`, name: "dweb.link" },
            { url: `https://gateway.pinata.cloud/ipfs/${ipfsPath}`, name: "Pinata" },
            { url: `https://ipfs.infura.io/ipfs/${ipfsPath}`, name: "Infura" },
            { url: `https://gateway.ipfs.io/ipfs/${ipfsPath}`, name: "IPFS.io" },
            { url: `https://w3s.link/ipfs/${ipfsPath}`, name: "Web3.Storage" },
        ]);
    }

    // Try each gateway
    for (let i = 0; i < gateways.length; i++) {
        const gateway = gateways[i];
        const gatewayName = gateway.isOriginal ? "original source" : gateway.name;
        
        try {
            console.log(`Downloading Duck #${tokenId} using ${gatewayName}: ${gateway.url}`);
            
            // Set a timeout for the fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout
            
            const response = await fetch(gateway.url, { 
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            clearTimeout(timeoutId); // Clear the timeout if fetch completes

            if (!response.ok) {
                console.error(`Failed with ${gatewayName}: ${response.statusText}`);
                // Try next gateway
                continue;
            }

            const imageBuffer = await response.arrayBuffer();
            await fs.writeFile(imagePath, Buffer.from(imageBuffer));

            console.log(`Saved Duck #${tokenId} to ${imagePath} using ${gatewayName}`);
            return { localPath: relativePath, success: true };
        } catch (error) {
            console.error(`Error with ${gatewayName}: ${error.message}`);
            // Try next gateway
            continue;
        }
    }
    
    console.error(`All gateway attempts failed for Duck #${tokenId}`);
    
    // One last attempt - if we know it's a webp file, try directly constructing the raw CID URL
    // Sometimes this works when all other gateways fail
    if (imageUrl.includes('.webp') && ipfsHash) {
        try {
            const rawCidUrl = `https://bafybeiawbzfyv6bueadwaftlayoh7tufvziiyhbfbe2l5dn67fgsnzt5ay.ipfs.dweb.link/${tokenId}.webp`;
            console.log(`Last resort attempt for Duck #${tokenId} with direct CID URL: ${rawCidUrl}`);
            
            const response = await fetch(rawCidUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            if (response.ok) {
                const imageBuffer = await response.arrayBuffer();
                await fs.writeFile(imagePath, Buffer.from(imageBuffer));
                console.log(`Saved Duck #${tokenId} to ${imagePath} using direct CID URL`);
                return { localPath: relativePath, success: true };
            }
        } catch (error) {
            console.error(`Final attempt failed for Duck #${tokenId}: ${error.message}`);
        }
    }
    
    // If we still don't have the image, create a placeholder to continue processing
    console.log(`Creating placeholder for Duck #${tokenId} to continue processing`);
    try {
        // Create a small placeholder image or copy a default image
        // Here we're just writing a text file as a marker, but you could create/copy a real image
        await fs.writeFile(imagePath, "Placeholder for missing image");
        console.log(`Created placeholder for Duck #${tokenId}`);
        return { localPath: relativePath, success: true, isPlaceholder: true };
    } catch (error) {
        console.error(`Failed to create placeholder for Duck #${tokenId}: ${error.message}`);
        return { success: false, error: "All gateway attempts failed" };
    }
}

async function generateDuckMetadata(duck) {
    const tokenId = duck.tokenId;
    
    // Check if metadata already exists
    const metadataDir = path.join(process.cwd(), 'src', 'collections', 'ducks');
    try {
        await fs.access(metadataDir);
    } catch {
        await fs.mkdir(metadataDir, { recursive: true });
        console.log(`Created directory: ${metadataDir}`);
    }

    const metadataPath = path.join(metadataDir, `${tokenId}.json`);
    
    // Check if metadata file already exists
    try {
        await fs.access(metadataPath);
        console.log(`Metadata for Duck #${tokenId} already exists, skipping generation`);
        // Read and return the existing metadata
        const existingMetadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
        return existingMetadata;
    } catch {
        // Metadata doesn't exist, continue with generation
    }

    const openrouterApiKey = process.env.OPENROUTER_APIKEY;
    // const siteUrl = "https://deadducks.io";
    // const siteName = "Dead Ducks Collective";
    const model = "google/gemini-2.0-flash-001";
    const useDuckImage = true;
    
    if (!openrouterApiKey) {
        throw new Error("OpenRouter API key is required");
    }

    // Extract rarity from attribute trait value
    function extractRarity(traitValue) {
        if (!traitValue || typeof traitValue !== 'string') {
            console.log(`Warning: Invalid trait value: ${JSON.stringify(traitValue)}`);
            return 'C'; // Default to Common for invalid values
        }
        const match = traitValue.match(/^Trait_[^_]+_([CREL])_/);
        return match ? match[1] : 'C'; // Default to Common
    }

    // Clean up trait values for better readability
    function cleanTraitValue(value) {
        if (!value || typeof value !== 'string') {
            console.log(`Warning: Invalid trait value: ${JSON.stringify(value)}`);
            return 'Unknown';
        }
        return value.replace(/^Trait_[^_]+_[CREL]_/, '').replace(/_/g, ' ');
    }

    // Get readable traits
    const traits = {};
    duck.attributes.forEach(attr => {
        const traitName = attr.trait_type.replace(/^\d+\s+/, ''); // Remove numbering
        const rawValue = attr.value;
        const cleanValue = cleanTraitValue(rawValue);
        const rarity = extractRarity(rawValue);

        traits[traitName] = {
            value: cleanValue,
            rarity
        };
    });

    // Count each rarity type
    const rarityClasses = duck.attributes.map(attr => extractRarity(attr.value));
    const rarityCounts = {
        C: rarityClasses.filter(r => r === 'C').length,
        R: rarityClasses.filter(r => r === 'R').length,
        E: rarityClasses.filter(r => r === 'E').length,
        L: rarityClasses.filter(r => r === 'L').length || 0
    };

    // Determine overall rarity level
    let rarityLevel = 'Common';
    if (rarityCounts.L >= 1) rarityLevel = 'Legendary';
    else if (rarityCounts.E >= 3) rarityLevel = 'Epic';
    else if (rarityCounts.E >= 1 || rarityCounts.R >= 3) rarityLevel = 'Rare';
    else if (rarityCounts.R >= 1) rarityLevel = 'Uncommon';

    // Construct prompt for the LLM
    const prompt = `You are tasked with creating a character profile for a digital collectible NFT duck character in a post-apocalyptic blockchain game.
  
  Duck #${duck.tokenId} has the following traits:
  ${Object.entries(traits).map(([key, data]) => `- ${key}: ${data.value} (Rarity: ${data.rarity === 'C' ? 'Common' : data.rarity === 'R' ? 'Rare' : data.rarity === 'E' ? 'Epic' : 'Legendary'})`).join('\n')}
  
  Overall rarity level: ${rarityLevel}
  
  Game Background:
  The ducks live in a place called "Subchain City," a post-apocalyptic wasteland where they compete for a limited resource called "DRIP" which is drying up liquidity on the blockchain. The ducks form flocks to try and compete against each other in raids for this resource. The game is a mixture between Advance Wars and D&D - with tactical map-based gameplay and narrative RPG elements.
  
  Based on the duck's traits and rarities, create a character profile with a creative name, class, backstory, personality traits, special ability and stats. Keep the tone gritty, slightly humorous, and dystopian. Make the character feel unique based on its traits.`;

    // Define JSON schema for structured output
    const jsonSchema = {
        "name": "duckCharacter",
        "strict": true,
        "schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Creative character name beyond just 'Dead Duck #X'"
                },
                "class": {
                    "type": "string",
                    "description": "Character class (e.g., Scout, Tank, Healer) that fits the duck's equipment and attributes"
                },
                "backstory": {
                    "type": "string",
                    "description": "Brief backstory (2-3 sentences) that fits the duck's visual traits and the post-apocalyptic theme"
                },
                "personality": {
                    "type": "string",
                    "description": "Description of 2-3 key personality traits and how they manifest"
                },
                "specialAbility": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Name of the duck's special ability"
                        },
                        "description": {
                            "type": "string",
                            "description": "Description of what the ability does in the game context"
                        }
                    },
                    "required": ["name", "description"]
                },
                "stats": {
                    "type": "object",
                    "properties": {
                        "strength": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 100,
                            "description": "Physical strength stat (1-100)"
                        },
                        "intelligence": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 100,
                            "description": "Intelligence stat (1-100)"
                        },
                        "agility": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 100,
                            "description": "Agility stat (1-100)"
                        },
                        "luck": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 100,
                            "description": "Luck stat (1-100)"
                        }
                    },
                    "required": ["strength", "intelligence", "agility", "luck"]
                }
            },
            "required": ["name", "class", "backstory", "personality", "specialAbility", "stats"],
            "additionalProperties": false
        }
    };

    // Build the messages array
    const messages = [
        {
            "role": "user",
            "content": useDuckImage ? [
                {
                    "type": "text",
                    "text": prompt
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": duck.image
                    }
                }
            ] : prompt
        }
    ];

    try {
        // Call OpenRouter API
        console.log(`Generating metadata for Duck #${tokenId}...`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openrouterApiKey}`,
                // "HTTP-Referer": siteUrl,
                // "X-Title": siteName,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": model,
                "messages": messages,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": jsonSchema
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const generatedContent = data.choices[0].message.content;

        // Parse the JSON response
        let jsonData;
        try {
            // For models that might not fully respect the schema
            if (typeof generatedContent === 'string') {
                jsonData = JSON.parse(generatedContent);
            } else {
                jsonData = generatedContent;
            }
        } catch (e) {
            console.error(`Error parsing JSON for Duck #${tokenId}:`, e);
            throw new Error(`Failed to parse JSON response: ${e.message}`);
        }

        // Create the complete metadata
        const completeMetadata = {
            ...duck,
            gameData: {
                ...jsonData,
                rarity: rarityLevel,
                traits: Object.entries(traits).map(([key, data]) => ({
                    type: key,
                    value: data.value,
                    rarity: data.rarity
                })),
                generatedAt: new Date().toISOString(),
            }
        };

        // Save metadata - always save to the correct Astro collections directory
        await fs.writeFile(metadataPath, JSON.stringify(completeMetadata, null, 2));
        console.log(`Saved metadata for Duck #${tokenId} to ${metadataPath}`);

        return completeMetadata;
    } catch (error) {
        console.error(`Error generating metadata for Duck #${tokenId}:`, error);
        throw error;
    }
}

// Call the function
async function processDucks() {
    console.log("Starting to process ducks...");
    const ducks = await getAllNFTsInCollection().catch(error => {
        console.error("Error fetching NFTs:", error);
        return null;
    });
    
    if (!ducks || ducks.length === 0) {
        console.error("Failed to retrieve ducks or no ducks found");
        return;
    }
    
    console.log(`Processing ${ducks.length} ducks...`);

    // Create a success/failure tracking log
    const processLog = {
        total: ducks.length,
        successful: 0,
        failed: 0,
        skipped: 0,
        failures: []
    };
    
    // Process each duck
    for (let i = 0; i < ducks.length; i++) {
        try {
            const duck = ducks[i];
            console.log(`\n==== Processing duck ${i+1}/${ducks.length} (ID: ${duck.tokenId}) ====`);
            
            // First download the image
            const imageResult = await downloadDuckImage(duck);
            
            // Proceed with metadata if image download was successful or already exists
            if (imageResult && imageResult.success) {
                try {
                    await generateDuckMetadata(duck);
                    processLog.successful++;
                    console.log(`✅ Duck #${duck.tokenId} processed successfully`);
                } catch (metadataError) {
                    console.error(`❌ Metadata generation failed for Duck #${duck.tokenId}:`, metadataError);
                    processLog.failed++;
                    processLog.failures.push({
                        tokenId: duck.tokenId,
                        stage: 'metadata',
                        error: metadataError.message
                    });
                }
            } else {
                console.error(`⚠️ Skipping metadata generation for Duck #${duck.tokenId} due to image download failure`);
                processLog.skipped++;
                processLog.failures.push({
                    tokenId: duck.tokenId,
                    stage: 'image',
                    error: imageResult ? imageResult.error : 'Unknown error'
                });
            }
        } catch (error) {
            console.error(`❌ Error processing Duck #${ducks[i].tokenId}:`, error);
            processLog.failed++;
            processLog.failures.push({
                tokenId: ducks[i].tokenId,
                stage: 'processing',
                error: error.message
            });
        }
        
        // Add a small delay between ducks to avoid rate limiting
        if (i < ducks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    // Log summary
    console.log("\n==== Processing Summary ====");
    console.log(`Total ducks: ${processLog.total}`);
    console.log(`Successfully processed: ${processLog.successful}`);
    console.log(`Failed: ${processLog.failed}`);
    console.log(`Skipped metadata: ${processLog.skipped}`);
    
    if (processLog.failures.length > 0) {
        console.log("\nFailures:");
        processLog.failures.forEach(failure => {
            console.log(`- Duck #${failure.tokenId} (${failure.stage}): ${failure.error}`);
        });
    }
    
    console.log("\nDuck processing completed!");
    
    // Save the process log for reference
    try {
        const logPath = path.join(process.cwd(), 'duck_process_log.json');
        await fs.writeFile(logPath, JSON.stringify(processLog, null, 2));
        console.log(`Process log saved to ${logPath}`);
    } catch (error) {
        console.error("Failed to save process log:", error);
    }
}

// Start the process
processDucks().catch(error => {
    console.error("Fatal error in processDucks:", error);
});