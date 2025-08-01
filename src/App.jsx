import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import "./App.css";

// Enhanced normalization function
const normalizeCardName = (name) => {
  if (!name) return '';
  return name.trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .replace(/&/g, '&') // Preserve ampersand
    .replace(/J\s*&\s*K/g, 'J&K'); // Special handling for J&K Bank
};

// Helper to extract base card name
const getBaseCardName = (name) => {
  if (!name) return '';
  return name.replace(/\s*\([^)]*\)$/, '').trim();
};

// Helper to extract network variant
const getNetworkVariant = (name) => {
  if (!name) return '';
  const match = name.match(/\(([^)]+)\)$/);
  return match ? match[1] : '';
};

// Fuzzy matching utility functions
const levenshteinDistance = (a, b) => {
  if (!a || !b) return 100;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
};

const getMatchScore = (query, card) => {
  if (!query || !card) return 0;

  const q = query.toLowerCase();
  const c = card.toLowerCase();

  if (c === q) return 100;
  if (c.includes(q)) return 90;

  const qWords = q.split(/\s+/);
  const cWords = c.split(/\s+/);

  const matchingWords = qWords.filter(qWord =>
    cWords.some(cWord => cWord.includes(qWord))
  ).length;

  const similarity = 1 - (levenshteinDistance(q, c) / Math.max(q.length, c.length));

  return (matchingWords / qWords.length) * 0.7 + similarity * 0.3;
};


const highlightMatch = (text, query) => {
  if (!query.trim()) return text;

  const regex = new RegExp(`(${query.trim().split(/\s+/).map(word =>
    word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');

  return text.split(regex).map((part, i) =>
    regex.test(part) ? <mark key={i}>{part}</mark> : part
  );
};

const CreditCardDropdown = () => {
  const [creditCards, setCreditCards] = useState([]);
  const [swiggyOffers, setSwiggyOffers] = useState([]);
  const [zomatoOffers, setZomatoOffers] = useState([]);
  const [eatsureOffers, setEatsureOffers] = useState([]);
  const [allCards, setAllCards] = useState([]);
  const [filteredCards, setFilteredCards] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCard, setSelectedCard] = useState("");
  const [platformOffers, setPlatformOffers] = useState({
    Eatsure: [],
    Swiggy: [],
    Zomato: []
  });
  const [noOffersMessage, setNoOffersMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [showNoMatchMessage, setShowNoMatchMessage] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  useEffect(() => {
    const hasOffers = Object.values(platformOffers).some(offers => offers.length > 0);
    setShowScrollButton(hasOffers);
  }, [platformOffers]);

  const handleScrollDown = () => {
    window.scrollBy({
      top: window.innerHeight,
      behavior: "smooth"
    });
  };

  // Copy coupon to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("Coupon copied to clipboard!");
    });
  };

  // Fetch and parse CSV files
  useEffect(() => {
    const fetchAndParseCSV = (filePath) =>
      new Promise((resolve, reject) => {
        Papa.parse(filePath, {
          download: true,
          header: true,
          complete: (results) => resolve(results.data),
          error: (error) => reject(error),
        });
      });

    const fetchData = async () => {
      try {
        const [swiggyData, zomatoData, eatsureData, allCardsData] = await Promise.all([
          fetchAndParseCSV("/Swiggy.csv"),
          fetchAndParseCSV("/Zomato.csv"),
          fetchAndParseCSV("/Eatsure.csv"),
          fetchAndParseCSV("/All Cards.csv")
        ]);

        // Set offers data
        setSwiggyOffers(swiggyData);
        setZomatoOffers(zomatoData);
        setEatsureOffers(eatsureData);
        setAllCards(allCardsData);

        // Extract unique card names from all sources
        const cardSet = new Set();
        
        // Extract from Swiggy
        swiggyData.forEach(row => {
          if (row["Applicable to Credit cards"]) {
            row["Applicable to Credit cards"].split(",").forEach(card => {
              const normalized = getBaseCardName(normalizeCardName(card.trim()));
              cardSet.add(normalized);
            });
          }
        });
        
        // Extract from Zomato
        zomatoData.forEach(row => {
          if (row["Applicable to Credit cards"]) {
            row["Applicable to Credit cards"].split(",").forEach(card => {
              const normalized = getBaseCardName(normalizeCardName(card.trim()));
              cardSet.add(normalized);
            });
          }
        });
        
        // Extract from Eatsure
        eatsureData.forEach(row => {
          if (row["Applicable to Credit cards"]) {
            row["Applicable to Credit cards"].split(",").forEach(card => {
              const normalized = getBaseCardName(normalizeCardName(card.trim()));
              cardSet.add(normalized);
            });
          }
        });
        
        // Extract from All Cards
        allCardsData.forEach(row => {
          if (row["Applicable to Credit cards"]) {
            const normalized = getBaseCardName(normalizeCardName(row["Applicable to Credit cards"].trim()));
            cardSet.add(normalized);
          }
        });

        // Convert set to sorted array
        const uniqueCards = Array.from(cardSet).sort((a, b) => 
          a.toLowerCase().localeCompare(b.toLowerCase())
        );
        
        setCreditCards(uniqueCards);
      } catch (error) {
        console.error("Error fetching or parsing CSV files:", error);
      }
    };

    fetchData();
  }, []);

  // Handle search input
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    setSelectedCard("");
    setPlatformOffers({ Eatsure: [], Swiggy: [], Zomato: [] });
    setNoOffersMessage("");
    setShowNoMatchMessage(false);

    if (typingTimeout) clearTimeout(typingTimeout);

    if (!value) {
      setFilteredCards([]);
      return;
    }

    // Fuzzy matching for credit cards
    const results = creditCards
      .map(card => ({
        card,
        score: getMatchScore(value, card)
      }))
      .filter(item => item.score > 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    setFilteredCards(results.map(item => item.card));

    // Show "no matches" message if no results after 1 second
    if (results.length === 0 && value.length > 2) {
      const timeout = setTimeout(() => {
        setShowNoMatchMessage(true);
      }, 1000);
      setTypingTimeout(timeout);
    }
  };

  // Get offers for selected card
  const getOffersForSelectedCard = (offers, platform) => {
    if (!selectedCard) return [];
    
    return offers.filter((row) => {
      if (!row["Applicable to Credit cards"]) return false;
      
      const rowCards = row["Applicable to Credit cards"]
        .split(",")
        .map(c => getBaseCardName(normalizeCardName(c.trim())));
      
      return rowCards.some(baseCard => 
        baseCard.toLowerCase() === selectedCard.toLowerCase()
      );
    }).map((row) => {
      const offer = {};
      switch(platform) {
        case "Eatsure":
          offer.description = row["Description"];
          offer.coupon = row["Coupon Code"];
          break;
        case "Swiggy":
          offer.title = row["Offer Title"];
          offer.description = row["Offer Description"];
          offer.terms = row["Terms and Conditions"];
          offer.coupon = row["Offer Code"];
          offer.link = row["Link to Apply Coupon"];
          break;
        case "Zomato":
          offer.offer = row["Offer"];
          offer.terms = row["Terms and Conditions"];
          offer.coupon = row["Coupon Code"];
          break;
      }
      
      // Add variant information if available
      if (row["Applicable to Credit cards"]) {
        const cardName = row["Applicable to Credit cards"].split(",")[0];
        const variant = getNetworkVariant(cardName);
        if (variant) {
          offer.variant = variant;
        }
      }
      
      return offer;
    });
  };

  // Handle card selection
  const handleCardSelect = (card) => {
    setSelectedCard(card);
    setSearchTerm(card);
    setFilteredCards([]);
    setShowNoMatchMessage(false);
    if (typingTimeout) clearTimeout(typingTimeout);

    // Get offers from all platforms
    const eatsureOffers = getOffersForSelectedCard(eatsureOffers, "Eatsure");
    const swiggyOffers = getOffersForSelectedCard(swiggyOffers, "Swiggy");
    const zomatoOffers = getOffersForSelectedCard(zomatoOffers, "Zomato");

    setPlatformOffers({
      Eatsure: eatsureOffers,
      Swiggy: swiggyOffers,
      Zomato: zomatoOffers
    });

    // Check if card exists in All Cards.csv
    const cardExists = allCards.some(row => 
      row["Applicable to Credit cards"] && 
      getBaseCardName(normalizeCardName(row["Applicable to Credit cards"].trim())) === card
    );

    // Show "no offers" message only if card exists but has no offers
    if (cardExists && 
        eatsureOffers.length === 0 && 
        swiggyOffers.length === 0 && 
        zomatoOffers.length === 0) {
      setNoOffersMessage("No offers found for this card.");
    } else {
      setNoOffersMessage("");
    }
  };

  // Handle Enter key press
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setNoOffersMessage("");
      setPlatformOffers({ Eatsure: [], Swiggy: [], Zomato: [] });
      setShowNoMatchMessage(false);

      if (filteredCards.length > 0) {
        handleCardSelect(filteredCards[0]);
      } else if (searchTerm.trim() !== '') {
        // Check if search term matches any card
        const normalizedSearch = getBaseCardName(normalizeCardName(searchTerm.trim()));
        const exists = creditCards.some(card => 
          card.toLowerCase() === normalizedSearch.toLowerCase()
        );
        
        if (exists) {
          handleCardSelect(normalizedSearch);
        } else {
          setNoOffersMessage("Card not found in our database. Please try another name.");
        }
      }
    }
  };

  // Render offer cards based on platform
  const renderOfferCards = () => {
    return Object.entries(platformOffers).map(([platform, offers]) => {
      if (offers.length === 0) return null;

      return (
        <div key={platform} className="platform-offers">
          <h2 style={{ textAlign: 'center' }}>Offers on {platform}</h2>
          <div className="offers-container">
            {offers.map((offer, index) => (
              <div key={index} className="offer-card">
                {platform === "Eatsure" && (
                  <>
                    <p><strong>Description:</strong> {offer.description}</p>
                    {offer.variant && (
                      <p className="network-note">
                        <strong>Note:</strong> This benefit is applicable only on <em>{offer.variant}</em> variant
                      </p>
                    )}
                    <p>
                      <strong>Coupon Code:</strong> {offer.coupon}
                      <button 
                        onClick={() => copyToClipboard(offer.coupon)}
                        className="copy-button"
                      >
                        📋
                      </button>
                    </p>
                  </>
                )}
                
                {platform === "Swiggy" && (
                  <>
                    <p><strong>Offer Title:</strong> {offer.title}</p>
                    <p><strong>Description:</strong> {offer.description}</p>
                    <p><strong>Terms & Conditions:</strong> {offer.terms}</p>
                    {offer.variant && (
                      <p className="network-note">
                        <strong>Note:</strong> This benefit is applicable only on <em>{offer.variant}</em> variant
                      </p>
                    )}
                    <p><strong>Coupon Code:</strong> {offer.coupon} <button 
                        onClick={() => copyToClipboard(offer.coupon)}
                        className="copy-button"
                      >
                        📋
                      </button></p>
                    
                    {offer.link && (
                      <a 
                        href={offer.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="offer-link"
                      >
                        View Offer
                      </a>
                    )}
                  </>
                )}
                
                {platform === "Zomato" && (
                  <>
                    <p><strong>Offer:</strong> {offer.offer}</p>
                    <div className="terms-container">
                      <strong>Terms & Conditions:</strong>
                      <div>
                        {offer.terms}
                      </div>
                    </div>
                    {offer.variant && (
                      <p className="network-note">
                        <strong>Note:</strong> This benefit is applicable only on <em>{offer.variant}</em> variant
                      </p>
                    )}
                    <p>
                      <strong>Coupon Code:</strong> {offer.coupon}
                      <button 
                        onClick={() => copyToClipboard(offer.coupon)}
                        className="copy-button"
                      >
                        📋
                      </button>
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="container">
      <div className="search-section" style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '600px' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            placeholder="Search your credit card..."
            className="search-input"
            style={{
              border: showNoMatchMessage ? '1px solid red' : '1px solid #ccc'
            }}
          />
          {filteredCards.length > 0 && (
            <ul className="dropdown-list">
              {filteredCards.map((card, index) => (
                <li
                  key={index}
                  className="dropdown-item"
                  onClick={() => handleCardSelect(card)}
                >
                  {highlightMatch(card, searchTerm)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showNoMatchMessage && (
        <p className="no-match-message" style={{ 
          textAlign: 'center', 
          color: '#FF0000',
          fontWeight: 'bold',
          margin: '10px auto',
          maxWidth: '600px'
        }}>
          No matching cards found. Please try a different name.
        </p>
      )}

      {noOffersMessage && (
        <p className="no-offers-message" style={{ 
          textAlign: 'center', 
          color: '#1e7145',
          fontWeight: 'bold',
          margin: '10px auto',
          maxWidth: '600px'
        }}>
          {noOffersMessage}
        </p>
      )}

      {selectedCard && !noOffersMessage && (
        <div className="offers-section" style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '800px' }}>
            {renderOfferCards()}
          </div>
        </div>
      )}
      
      {showScrollButton && (
        <button 
          onClick={handleScrollDown}
          className="scroll-button"
          style={{
            position: 'fixed',
            right: '20px',
            bottom: isMobile ? '20px' : '150px',
            padding: isMobile ? '12px 15px' : '10px 20px',
            backgroundColor: '#1e7145',
            color: 'white',
            border: 'none',
            borderRadius: isMobile ? '50%' : '8px',
            cursor: 'pointer',
            fontSize: '18px',
            zIndex: 1000,
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
            width: isMobile ? '50px' : '140px',
            height: isMobile ? '50px' : '50px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '300px'
          }}
        >
          {isMobile ? '↓' : 'Scroll Down'}
        </button>
      )}
      
      <div className="bottom-disclaimer">
        <h3>Disclaimer</h3>
        <p>
          All offers, coupons, and discounts listed on our platform are provided for informational purposes only. 
          We do not guarantee the accuracy, availability, or validity of any offer. Users are advised to verify 
          the terms and conditions with the respective merchants before making any purchase. We are not responsible 
          for any discrepancies, expired offers, or losses arising from the use of these coupons.
        </p>
      </div>
    </div>
  );
};

export default CreditCardDropdown;