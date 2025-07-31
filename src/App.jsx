import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import "./App.css";

// Helper function to normalize card names
const normalizeCardName = (name) => {
  if (!name) return '';
  return name.trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, ' ');
};

// Helper to extract base card name (remove network variant)
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
  
  const q = query.trim().toLowerCase();
  const c = card.trim().toLowerCase();
  
  if (c === q) return 100;
  if (c.includes(q)) return 90;
  
  const qWords = q.split(/\s+/);
  const cWords = c.split(/\s+/);
  
  const wordMatches = qWords.filter(qWord => 
    cWords.some(cWord => cWord.includes(qWord))
  ).length;
  
  const fuzzyWordMatches = qWords.filter(qWord => 
    cWords.some(cWord => {
      const distance = levenshteinDistance(qWord, cWord);
      const maxLen = Math.max(qWord.length, cWord.length);
      return distance <= 2 && (distance / maxLen) < 0.35;
    })
  ).length;
  
  const distance = levenshteinDistance(q, c);
  const maxLen = Math.max(q.length, c.length);
  const similarity = 1 - (distance / maxLen);
  
  return (
    (wordMatches / qWords.length) * 0.5 +
    (fuzzyWordMatches / qWords.length) * 0.3 +
    similarity * 0.2
  ) * 100;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredCards, setFilteredCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [platformOffers, setPlatformOffers] = useState({
    Eatsure: [],
    Swiggy: [],
    Zomato: []
  });
  const [noOffersMessage, setNoOffersMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [cardsLoaded, setCardsLoaded] = useState(false);

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

    const extractCreditCards = (data) => {
      const cards = [];
      data.forEach((row) => {
        const applicableCards = row["Applicable to Credit cards"];
        if (applicableCards) {
          const cardNames = applicableCards
            .split(",")
            .map((card) => {
              const normalized = normalizeCardName(card);
              return {
                fullName: normalized,
                baseName: getBaseCardName(normalized),
                network: getNetworkVariant(normalized)
              };
            });
          cards.push(...cardNames);
        }
      });
      return cards;
    };

    const fetchData = async () => {
      try {
        const [swiggyData, zomatoData, eatsureData] = await Promise.all([
          fetchAndParseCSV("/Swiggy.csv"),
          fetchAndParseCSV("/Zomato.csv"),
          fetchAndParseCSV("/Eatsure.csv")
        ]);

        const swiggyCards = extractCreditCards(swiggyData);
        const zomatoCards = extractCreditCards(zomatoData);
        const eatsureCards = extractCreditCards(eatsureData);

        const allCardsCombined = [...swiggyCards, ...zomatoCards, ...eatsureCards];
        
        const uniqueCards = Array.from(new Map(
          allCardsCombined.map(card => [card.fullName, card])
        ).values());

        setCreditCards(uniqueCards);
        setCardsLoaded(true); 
      } catch (error) {
        console.error("Error fetching or parsing CSV files:", error);
        setCardsLoaded(true);
      }
    };

    fetchData();
  }, []);

  // Fetch offers based on selected card
  const fetchOffers = async (card) => {
    const fetchAndParseCSV = (filePath) =>
      new Promise((resolve, reject) => {
        Papa.parse(filePath, {
          download: true,
          header: true,
          complete: (results) => resolve(results.data),
          error: (error) => reject(error),
        });
      });

    const filterOffers = (data, card, platform) => {
      const offers = data
        .filter((row) => {
          if (!row["Applicable to Credit cards"]) return false;
          
          const rowCards = row["Applicable to Credit cards"]
            .split(",")
            .map(c => normalizeCardName(c.trim()));
            
          return rowCards.some(rowCard => {
            const rowBase = getBaseCardName(rowCard);
            const rowNetwork = getNetworkVariant(rowCard);
            
            return rowBase === card.baseName && 
                   (!rowNetwork || !card.network || rowNetwork === card.network);
          });
        })
        .map((row) => {
          // Format based on platform
          switch(platform) {
            case "Eatsure":
              return {
                description: row["Description"],
                coupon: row["Coupon Code"]
              };
            case "Swiggy":
              return {
                title: row["Offer Title"],
                description: row["Offer Description"],
                terms: row["Terms and Conditions"],
                coupon: row["Offer Code"],
                link: row["Link to Apply Coupon"]
              };
            case "Zomato":
              return {
                offer: row["Offer"],
                terms: row["Terms and Conditions"],
                coupon: row["Coupon Code"]
              };
            default:
              return {};
          }
        });
      
      return offers;
    };

    try {
      const [swiggyData, zomatoData, eatsureData] = await Promise.all([
        fetchAndParseCSV("/Swiggy.csv"),
        fetchAndParseCSV("/Zomato.csv"),
        fetchAndParseCSV("/Eatsure.csv")
      ]);

      const swiggyOffers = filterOffers(swiggyData, card, "Swiggy");
      const zomatoOffers = filterOffers(zomatoData, card, "Zomato");
      const eatsureOffers = filterOffers(eatsureData, card, "Eatsure");

      setPlatformOffers({
        Eatsure: eatsureOffers,
        Swiggy: swiggyOffers,
        Zomato: zomatoOffers
      });

      const cardInDatabase = creditCards.some(c => 
        c.fullName.toLowerCase() === card.fullName.toLowerCase()
      );

      if (eatsureOffers.length === 0 && swiggyOffers.length === 0 && zomatoOffers.length === 0) {
        if (cardInDatabase) {
          setNoOffersMessage("No offers found for this card.");
        } else {
          setNoOffersMessage("Card not found in our database. Please try another name.");
        }
      } else {
        setNoOffersMessage("");
      }
    } catch (error) {
      console.error("Error fetching or filtering offers:", error);
      setNoOffersMessage("Error fetching offers. Please try again.");
    }
  };

  // Handle search input
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    setSelectedCard(null);
    setPlatformOffers({ Eatsure: [], Swiggy: [], Zomato: [] });
    setNoOffersMessage("");

    if (value === "") {
      setFilteredCards([]);
      return;
    }

    const matchingCards = creditCards
      .map(card => ({
        ...card,
        score: getMatchScore(value, card.fullName)
      }))
      .filter(card => card.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    setFilteredCards(matchingCards);
  };

  // Handle card selection
  const handleCardSelect = (card) => {
    setSelectedCard(card);
    setSearchTerm(card.fullName);
    setFilteredCards([]);
    setPlatformOffers({ Eatsure: [], Swiggy: [], Zomato: [] });
    setNoOffersMessage("");
    fetchOffers(card);
  };

  // Handle Enter key press
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCards.length > 0) {
        handleCardSelect(filteredCards[0]);
      } else if (searchTerm.trim() !== '') {
        const cardExists = creditCards.some(card => 
          card.fullName.toLowerCase() === searchTerm.toLowerCase().trim()
        );
        
        if (cardExists) {
          setNoOffersMessage("No offers found for this card.");
        } else {
          setNoOffersMessage("Card not found. Please try another name.");
        }
        
        setSelectedCard(null);
        setPlatformOffers({ Eatsure: [], Swiggy: [], Zomato: [] });
      }
    }
  };

  useEffect(() => {
    if (searchTerm.trim() !== '' && 
        filteredCards.length === 0 && 
        !selectedCard) {
      setNoOffersMessage("Card not found. Please try another name.");
    }
  }, [searchTerm, filteredCards, selectedCard]);

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
                    <p><strong>Terms:</strong> {offer.terms}</p>
                    <p><strong>Coupon Code:</strong> {offer.coupon}</p>
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
                      <div className="scrollable-terms">
                        {offer.terms}
                      </div>
                    </div>
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
          />
          {filteredCards.length > 0 && (
            <ul className="dropdown-list">
              {filteredCards.map((card, index) => (
                <li
                  key={index}
                  className="dropdown-item"
                  onClick={() => handleCardSelect(card)}
                >
                  {highlightMatch(card.fullName, searchTerm)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {noOffersMessage && (
        <p className="no-offers-message" style={{ 
          textAlign: 'center', 
          color: noOffersMessage.includes("not found") ? '#ff0000' : 'inherit',
          fontWeight: noOffersMessage.includes("not found") ? 'bold' : 'normal'
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