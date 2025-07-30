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
// Updated Levenshtein distance calculation
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

// Enhanced fuzzy matching with multiple strategies
const getMatchScore = (query, card) => {
  if (!query || !card) return 0;
  
  const q = query.trim().toLowerCase();
  const c = card.trim().toLowerCase();
  
  // Strategy 1: Exact match (highest priority)
  if (c === q) return 100;
  
  // Strategy 2: Substring match
  if (c.includes(q)) return 90;
  
  // Strategy 3: Word-based matching
  const qWords = q.split(/\s+/);
  const cWords = c.split(/\s+/);
  
  const wordMatches = qWords.filter(qWord => 
    cWords.some(cWord => cWord.includes(qWord))
  ).length;
  
  // Strategy 4: Fuzzy word matching
  const fuzzyWordMatches = qWords.filter(qWord => 
    cWords.some(cWord => {
      const distance = levenshteinDistance(qWord, cWord);
      const maxLen = Math.max(qWord.length, cWord.length);
      return distance <= 2 && (distance / maxLen) < 0.35;
    })
  ).length;
  
  // Strategy 5: Overall similarity
  const distance = levenshteinDistance(q, c);
  const maxLen = Math.max(q.length, c.length);
  const similarity = 1 - (distance / maxLen);
  
  // Combine scores (prioritize word matches)
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
  const [allCardsList, setAllCardsList] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredCards, setFilteredCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [swiggyOffers, setSwiggyOffers] = useState([]);
  const [zomatoOffers, setZomatoOffers] = useState([]);
  const [noOffersMessage, setNoOffersMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
   const [cardsLoaded, setCardsLoaded] = useState(false);

  // Check screen width to detect if it's mobile
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

  // Determine if we should show scroll button
  useEffect(() => {
    const hasOffers = swiggyOffers.length > 0 || zomatoOffers.length > 0;
    setShowScrollButton(hasOffers);
  }, [swiggyOffers, zomatoOffers]);

  // Scroll handler function
  const handleScrollDown = () => {
    window.scrollBy({
      top: window.innerHeight,
      behavior: "smooth"
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

    const fetchAllCardsList = async () => {
      try {
        const data = await fetchAndParseCSV("/All Cards.csv");
        const cards = [];
        data.forEach((row) => {
          const cardName = row["Applicable to Credit cards"];
          if (cardName) {
            const normalized = normalizeCardName(cardName);
            cards.push({
              fullName: normalized,
              baseName: getBaseCardName(normalized),
              network: getNetworkVariant(normalized)
            });
          }
        });
        return cards;
      } catch (error) {
        console.error("Error fetching All Cards:", error);
        return [];
      }
    };

    const fetchData = async () => {
      try {
        const [swiggyData, zomatoData, allCards] = await Promise.all([
          fetchAndParseCSV("/Swiggy.csv"),
          fetchAndParseCSV("/Zomato.csv"),
          fetchAllCardsList()
        ]);

        const swiggyCards = extractCreditCards(swiggyData);
        const zomatoCards = extractCreditCards(zomatoData);

        // Combine all cards from different sources
        const allCardsCombined = [...swiggyCards, ...zomatoCards, ...allCards];
        
        // Remove duplicates based on full name
        const uniqueCards = Array.from(new Map(
          allCardsCombined.map(card => [card.fullName, card])
        ).values());

        setCreditCards(uniqueCards);
      setAllCardsList(allCards);
      setCardsLoaded(true); 
    } catch (error) {
      console.error("Error fetching or parsing CSV files:", error);
      setCardsLoaded(true); // Still mark as loaded even if error
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

  const filterOffers = (data, card) =>
    data
      .filter((row) => {
        if (!row["Applicable to Credit cards"]) return false;
        
        const rowCards = row["Applicable to Credit cards"]
          .split(",")
          .map(c => normalizeCardName(c.trim()));
          
        return rowCards.some(rowCard => {
          const rowBase = getBaseCardName(rowCard);
          const rowNetwork = getNetworkVariant(rowCard);
          
          // Match if base name matches and network is either not specified or matches
          return rowBase === card.baseName && 
                 (!rowNetwork || !card.network || rowNetwork === card.network);
        });
      })
      .map((row) => ({
        offer: row["Offer"],
        coupon: row["Coupon code"],
      }));

  try {
    const [swiggyData, zomatoData] = await Promise.all([
      fetchAndParseCSV("/Swiggy.csv"),
      fetchAndParseCSV("/Zomato.csv"),
    ]);

    const swiggyFiltered = filterOffers(swiggyData, card);
    const zomatoFiltered = filterOffers(zomatoData, card);

    setSwiggyOffers(swiggyFiltered);
    setZomatoOffers(zomatoFiltered);

    // Check if the card exists in our database
    const cardInDatabase = creditCards.some(c => 
      c.fullName.toLowerCase() === card.fullName.toLowerCase()
    );

    if (swiggyFiltered.length === 0 && zomatoFiltered.length === 0) {
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
    
    // Clear existing offers and selection when typing
    setSelectedCard(null);
    setSwiggyOffers([]);
    setZomatoOffers([]);
    setNoOffersMessage("");

    if (value === "") {
      setFilteredCards([]);
      return;
    }

    // Use fuzzy matching to find relevant cards
    const matchingCards = creditCards
      .map(card => ({
        ...card,
        score: getMatchScore(value, card.fullName)
      }))
      .filter(card => card.score > 0.3)  // Threshold for relevance
      .sort((a, b) => b.score - a.score) // Sort by best match first
      .slice(0, 10); // Limit to top 10 results

    setFilteredCards(matchingCards);
  };

  // Handle card selection
  const handleCardSelect = (card) => {
    setSelectedCard(card);
    setSearchTerm(card.fullName);
    setFilteredCards([]);
    setSwiggyOffers([]);
    setZomatoOffers([]);
    setNoOffersMessage("");
    fetchOffers(card);
  };

  // Handle Enter key press
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // If there are filtered cards, select the top match
      if (filteredCards.length > 0) {
        handleCardSelect(filteredCards[0]);
      } 
      // If no cards match but search term exists
      else if (searchTerm.trim() !== '') {
        // Check if card exists in our database
        const cardExists = creditCards.some(card => 
          card.fullName.toLowerCase() === searchTerm.toLowerCase().trim()
        );
        
        if (cardExists) {
          // This card exists but we didn't find any offers
          setNoOffersMessage("No offers found for this card.");
        } else {
          // Card doesn't exist in our database
          setNoOffersMessage("Card not found. Please try another name.");
        }
        
        // Clear any previous selection
        setSelectedCard(null);
        setSwiggyOffers([]);
        setZomatoOffers([]);
      }
    }
  };

  // Auto-detect when no cards match the search
  useEffect(() => {
    if (searchTerm.trim() !== '' && 
        filteredCards.length === 0 && 
        !selectedCard) {
      setNoOffersMessage("Card not found. Please try another name.");
    }
  }, [searchTerm, filteredCards, selectedCard]);

  return (
    <div className="container">
      {/* Search and dropdown section */}
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
                  {/* Highlight matching parts */}
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
            {zomatoOffers.length > 0 && (
              <div className="platform-offers">
                <h2 style={{ textAlign: 'center' }}>Zomato Offers</h2>
                <div className="offers-container">
                  {zomatoOffers.map((offer, index) => (
                    <div key={index} className="offer-card">
                      <p><strong>Offer:</strong> {offer.offer}</p>
                      <p><strong>Coupon Code:</strong> {offer.coupon}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {swiggyOffers.length > 0 && (
              <div className="platform-offers">
                <h2 style={{ textAlign: 'center' }}>Swiggy Offers</h2>
                <div className="offers-container">
                  {swiggyOffers.map((offer, index) => (
                    <div key={index} className="offer-card">
                      <p><strong>Offer:</strong> {offer.offer}</p>
                      <p><strong>Coupon Code:</strong> {offer.coupon}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showScrollButton && (
        <button 
          onClick={handleScrollDown}
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
            marginBottom:'300px'
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