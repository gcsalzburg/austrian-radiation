
import austria_poly from './austria-1km.js';

const grid_extent = [9.25, 46.25, 17.45, 49.1];   // Area to fill with grid for measurements
const grid_size = 10;                             // Distance between grid points, smaller = slower (km)

let last_isobands;                                // Save this for "what's the radiation at" style queries

function createintervals(lower_bound, upper_bound, increments, unit){
   // Calculate isoband intervals
   var intervals = {
      bands: [],
      band_properties: []
   };
   for(let i=lower_bound; i<=upper_bound; i+=increments){
      intervals.bands.push(i);
      intervals.band_properties.push({
         'radiation_lower':  i,
         'radiation_mid':    Math.round(i+(increments/2)),
         'description':      i+" - "+(i+increments)+" "+unit
      });
   }

   return intervals;
}

function radiation_at(loc){
   let lvl = null;
   last_isobands.features.forEach(function(isoband) {
      if(turf.booleanPointInPolygon(loc,isoband)){
            lvl = isoband.properties.radiation_mid;
      }
   });

   return lvl;
}

function fetch_data(stations) {
   return new Promise(function(resolve, reject){

      var request = new XMLHttpRequest();
      request.open('GET', "https://sfws.lfrz.at/json.php?command=getdata", true);

      request.onload = function() {
         if (request.status >= 200 && request.status < 400) {
            // Success!

            let range = {
               lower: {
                  val: 99999999999,
                  name: ""
               },
               upper: {
                  val :0,
                  name: ""
               }
            };
            let age = 0;
            
            var data = JSON.parse(request.responseText);
            $.each( data.values, function( key, val ) {
               // Save station values and min/max values
               stations[key].val = val.v;
               if(val.v > range.upper.val){
                  range.upper.val = val.v;
                  range.upper.name = stations[key].name;
               }
               if(val.v < range.lower.val){
                  range.lower.val = val.v;
                  range.lower.name = stations[key].name;
               }
               age = val.d; // save timestamp from data
            });

            // Create an array of points from the heatmap data values
            var rawDataArray = [];
            $.each(stations, function(k,v){
               var loc = turf.point([v.lng, v.lat], {radiation: v.val, station_name: v.name});
               rawDataArray.push(loc);
            });
            
            var rawDataPoints = turf.featureCollection(rawDataArray);

            // Add "fake" duplicate points just outside the bounds to stretch coverage across whole of Austria
            var rawDataFeatures = rawDataPoints.features;
            rawDataFeatures.push(turf.point([15.451882,49.013285],{radiation: stations["AT0716"].val})); // Waidhofen/Ybbs
            rawDataFeatures.push(turf.point([14.887182,49.032998],{radiation: stations["AT0514"].val})); // Gmünd/NÖ
            rawDataFeatures.push(turf.point([14.549704,46.312700],{radiation: stations["AT0305"].val})); // Bad Eisenkappel
            rawDataFeatures.push(turf.point([9.442690,47.210770], {radiation: stations["AT1906"].val}));  // Feldkirch
            rawDataFeatures.push(turf.point([17.224055,48.144801],{radiation: stations["AT0520"].val}));  // Hainburg
            rawDataFeatures.push(turf.point([17.225467,47.799404],{radiation: stations["AT0104"].val}));  // Frauenkirchen
            rawDataPoints = turf.featureCollection(rawDataFeatures);

            resolve({
               range: range,
               data: rawDataPoints,
               age: age
            });
         } else {
            // We reached our target server, but it returned an error

         }
      };
      request.send();
   });
  
}


/* Takes a turf object of rawDataPoints, each containing the data for an individual station
   Example format:
   {
      AT0012: {
         lat: 48.20412
         lng: 13.093043999999999
         name: "Braunau/Inn AMS"
         val: 95.9
         x: 316
         y: 105
      },
      AT0103: {
         lat: 47.85897
         lng: 16.57868
         name: "Eisenstadt"
         val: 87.4​
         x: 624​​
         y: 150
      },
      ...
   }

   Returns a set of isobands for these points
*/
function points2isobands(rawDataPoints, intervals, calc_method = 'interpolate'){
   // calc_method options are: nearest || average || interpolate  

   // Add unique identifier to each point (e.g. to be used in back reference from TIN coords)
   var index = 0;
   rawDataPoints.features.forEach(function(f) {
      f.properties.ref = index;
      index++;
   });

   // Choose which method to calculate the radiation value for the points by
   switch(calc_method){

      // Method A: Calculate which unstructured data point each point is nearest to    
      case 'nearest': 

         // Create a nearest neighbour grid
         var grid = turf.pointGrid(grid_extent, grid_size, {units: 'kilometres'});
         grid.features.forEach(function(f) {
               var near_point = turf.nearestPoint(f,rawDataPoints);
               f.properties.radiation = near_point.properties.radiation;
         });        
         break; 

      // Method B: Calculate TIN polygons and determine which polygon each point lies within
      case 'average':

         // Create TIN polygons
         var tin_polys = turf.tin(rawDataPoints, 'ref');

         // Add radiation sum as property to each tin poly.
         tin_polys.features.forEach(function(polyfeat) {
               var radiation_sum = 0;
               var fp = polyfeat.properties;
               rawDataPoints.features.forEach(function(rawPoint) {
                  var rpp = rawPoint.properties;
                  if((rpp.ref == fp.a)||(rpp.ref == fp.b)||(rpp.ref == fp.c)){
                     radiation_sum += rpp.radiation;
                  }
               });
               fp.radiation = radiation_sum/3;
         });

         // Add TIN polys as a map source
         // map.addSource("tin-polys", {"type": "geojson","data": tin_polys});

         // Create the grid
         var grid = turf.pointGrid(grid_extent, grid_size, {units: 'kilometres'});

         // Calculate which tin poly each point is inside
         // TODO: Change from forEach to different loop format to enable break out after test passes
         grid.features.forEach(function(f) {
               f.properties.radiation = 0;
               tin_polys.features.forEach(function(tin_feat) {
                  if(turf.booleanPointInPolygon(f,tin_feat)){
                     f.properties.radiation = tin_feat.properties.radiation;
                  }
               });
         });
         break;

      // Method C: Calculate which unstructured data point each point is nearest to    
      case 'interpolate': 

         // Create interpolation grid
         var grid = turf.interpolate(rawDataPoints, grid_size, {
               gridType: 'points',
               property: 'radiation',
               units: 'kilometres',
               weight: 10                 // Exponent decay constant for interpolation grid (bigger = faster decay)
         })
         break;
   }

   // Now deal with the points outside the bounds of the measured values.
   // We give these a nearest-neighbour value, to fill out the small edges of the outline of Austria which would otherwise be missed
   grid.features.forEach(function(f) {
      if(f.properties.radiation == 0){
         f.properties.radiation = turf.nearestPoint(f,rawDataPoints).properties.radiation;
      }
   });


   // Create the isobands
   var isobands = turf.isobands(grid,intervals.bands,{zProperty: 'radiation', breaksProperties: intervals.band_properties});

   // Crop them to the size of Austria (which is the only area we have valid data for)
   // We use Martinez for this
   var croppedisobands_array = [];
   var i=0;
   isobands.features.forEach(function(f) {
      // Filter out isobands with no geometry in them to avoid Martinez crashing
      if(f.geometry.coordinates.length > 0){
         croppedisobands_array.push({
               type: "Feature",
               properties: f.properties,
               geometry: {
                  type: "MultiPolygon",
                  coordinates: martinez.intersection(f.geometry.coordinates,austria_poly.geometry.coordinates)
               }
         });
      }
   });  

   const cropped_isobands = turf.featureCollection(croppedisobands_array);

   last_isobands = cropped_isobands;

   return {
      grid: grid,
      isobands: cropped_isobands
   };  
}

export{
   points2isobands,
   grid_extent,
   createintervals,
   fetch_data,
   radiation_at
};