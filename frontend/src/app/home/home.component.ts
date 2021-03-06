import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, OnInit } from '@angular/core';
import * as debounce from "debounce";
import * as leaflet from 'leaflet';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements AfterViewInit {

  displayOptions: DisplayOption[] = [
    {value: 0, display: "Raw data"},
    {value: 1, display: "Compare (diff)"},
    {value: 2, display: "Compare (split)"},
  ];

  selectedRadius: number = 5;

  radius: number[] = [1,2,5,10,25,50];
  osmResults: OSMPlace[] | undefined = [];

  dateData: Box[][] = [];

  options = [];

  searchBoxAddress = "";

  searchAddress = debounce(this.searchOSMApi, 500);
  
  selectedAddress: OSMPlace | undefined;

  minDate = new Date(2020,11,1);
  maxDate = new Date(2020,11,31);

  startDate = new Date(2020,11,1);
  endDate: Date | undefined = new Date(2020,11,31);

  startDate2 = new Date(2020,11,1);
  endDate2: Date | undefined = new Date(2020,11,31);

  constructor(private http: HttpClient) {
    this.showComparison = 0;
  }

  async searchOSMApi(){
    this.selectedAddress = undefined;
    this.osmResults = await this.http.get<OSMPlace[]>("https://nominatim.openstreetmap.org/search?format=json&q="+this.searchBoxAddress).toPromise();
  }

  points: any[] = [];
  points2: any[] = [];

  updateMap(){
    setTimeout(() => this.map.invalidateSize(),100);
    if(this.endDate==null){
      console.log("Not updating map");
      return;
    }
    if(this.showComparison==1){
      this.comparisonMap();
    }
    else{
      this.rawDataMap();
      if(this.showComparison==2){
        this.rawDataMap2();
      }
    }
  }

  showComparison: number = 0;

  async getDateData(lat:string,lon:string){
    const radius = 10;
    const boxSize = this.boxZoom;
    this.dateData = await this.http.get<Box[][]>(
      "http://localhost:3000/getTripsByDate?lat="+lat+"&lon="+lon
      +"&radius="+radius.toString()+"&boxSize="+boxSize.toString()
      ).toPromise() ?? [];
    if(this.showComparison==1){
      this.comparisonMap();
    }
    else{
      this.rawDataMap();
      if(this.showComparison==2){
        this.rawDataMap2();
      }
    }
  }

  comparisonMap(){
    for(let p of this.points){
      this.map.removeLayer(p);
    }
    let start = this.startDate.getDate()-1;
    let end = this.endDate?.getDate() ?? 31;
    let start2 = this.startDate2.getDate()-1;
    let end2 = this.endDate2?.getDate() ?? 31;
    this.points = [];
    for(let row of (this.dateData ?? [])){
      for(let box of row){
        let first = box.data.slice(start,end).map(e => e.length).reduce((a, b) => a + b);
        let second = box.data.slice(start2,end2).map(e => e.length).reduce((a, b) => a + b);
        let rawDif = second - first;
        let color;
        let percentDif = 0;
        let colors = [
          '#ff211f',//red
          '#ff961f',//purple
          '#f5ff1f',//yellow
          '#60f42a',//green
          '#0ae7ff',//light-blue
        ];
        if((first==0 && second==0) || (first==1 && second==0) || (first==0 && second==1)){
          continue;
        } else if(first==0){
          percentDif = 1;
          color = colors[4]
        }
        else{
          percentDif = rawDif/first;
          if(percentDif==0){
            color=colors[2]
          }
          else if(percentDif>=1){
            color = colors[4];
          }
          else if(percentDif>0){
            color = colors[3];
          }
          else if(percentDif>-1){
            color = colors[1];
          }
          else{
            color = colors[0];
          }
        }
        percentDif = Math.floor(percentDif * 100);
        let rect = leaflet.rectangle([box.p1,box.p2], {color: color, weight: 1, stroke: false, fillOpacity: 0.4})
        .bindTooltip(percentDif.toString()+"% change",{direction:'top',});
        this.points.push(rect);
        rect.addTo(this.map);
      }
    }
    var myIcon = leaflet.icon({
      iconUrl: 'assets/White_Logo.png',
      iconSize: [32,32],
    });
    const marker = leaflet.marker([this.selectedAddress?.lat ?? 0, this.selectedAddress?.lon ?? 0], {icon: myIcon}).addTo(this.map);
    this.points.push(marker);
    marker.addTo(this.map);
  }

  rawDataMap(){
    for(let p of this.points){
      this.map.removeLayer(p);
    }
    let start = this.startDate.getDate()-1;
    let end = this.endDate?.getDate() ?? 31;
    this.points = [];
    let boxId = 0;
    for(let row of (this.dateData ?? [])){
      for(let box of row){
        let count = box.data.slice(start,end).map(e => e.length).reduce((a, b) => a + b);
        let color;
        let colors = [
          '#1fff9e',//#1bf1ea
          '#0abeff',//#1b8fee
          '#000eff',//#2b1bf2
          '#a000ff',//#9d15ec
          '#ff1f69',//#f518d8
        ];
        if(count==0){
          continue;
        } else if(count==1){
          color = colors[0]
        }
        else if(count<=3){
          color = colors[1]
        }
        else if(count<=6){
          color=colors[2]
        }
        else if(count<=10){
          color=colors[3]
        }
        else{
          color=colors[4]
        }

        var tooltip = leaflet.tooltip({
          direction: 'top',
          opacity: 0.8
        });
        box.id = boxId;
        tooltip.setContent('<canvas id="myChart-'+boxId.toString()+'" width="350" height="250"></canvas>');
        let rect = leaflet.rectangle([box.p1,box.p2], {color: color, weight: 1, stroke: false, fillOpacity: 0.4})
        .bindTooltip(this.showComparison==0 ? tooltip : (count.toString()+" people visited"),{direction:'top',})
        rect.on("tooltipopen", () => {
          if(document.getElementById('myChart-'+box?.id?.toString())==undefined){
            return;
          }
          let data: Date[] = box.data.slice(start,end).map(d => d.map(e => new Date(e))).flat();
          let hours = new Array(24).fill(0);
          for(let d of data){
            hours[d.getHours()]++;
          }

          const myChart = new Chart(
            //@ts-ignore
            document.getElementById('myChart-'+box?.id?.toString()),
            {
              type: 'bar',
              data: {
                labels: [
                  "0:00","1:00","2:00","3:00","4:00","5:00","6:00",
                  "7:00","8:00","9:00","10:00","11:00","12:00",
                  "13:00","14:00","15:00","16:00","17:00","18:00",
                  "19:00","20:00","21:00","22:00","23:00"
                ],
                datasets: [{
                  backgroundColor: "#673ab7",
                  label: 'Customers per hour',
                  data: hours,
                }
              ]},
              options: {
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              },
            }
          );
        });
        this.points.push(rect);
        rect.addTo(this.map);
        boxId++;
      }
    }
    var myIcon = leaflet.icon({
      iconUrl: 'assets/White_Logo.png',
      iconSize: [32,32],
    });
    const marker = leaflet.marker([this.selectedAddress?.lat ?? 0, this.selectedAddress?.lon ?? 0], {icon: myIcon});
    this.points.push(marker);
    marker.addTo(this.map);
  }

  rawDataMap2(){
    for(let p of this.points2){
      this.map2.removeLayer(p);
    }
    let start = this.startDate2.getDate()-1;
    let end = this.endDate2?.getDate() ?? 31;
    this.points2 = [];
    for(let row of (this.dateData ?? [])){
      for(let box of row){
        let count = box.data.slice(start,end).map(e => e.length).reduce((a, b) => a + b);
        let color;
        let colors = [
          '#1fff9e',//#1bf1ea
          '#0abeff',//#1b8fee
          '#000eff',//#2b1bf2
          '#a000ff',//#9d15ec
          '#ff1f69',//#f518d8
        ];
        if(count==0){
          continue;
        } else if(count==1){
          color = colors[0]
        }
        else if(count<=3){
          color = colors[1]
        }
        else if(count<=6){
          color=colors[2]
        }
        else if(count<=10){
          color=colors[3]
        }
        else{
          color=colors[4]
        }
        let rect = leaflet.rectangle([box.p1,box.p2], {color: color, weight: 1, stroke: false, fillOpacity: 0.4})
        .bindTooltip(count.toString()+" people visited",{direction:'top',});
        this.points2.push(rect);
        rect.addTo(this.map2);
      }
    }
    var myIcon = leaflet.icon({
      iconUrl: 'assets/White_Logo.png',
      iconSize: [32,32],

    });
    const marker = leaflet.marker([this.selectedAddress?.lat ?? 0, this.selectedAddress?.lon ?? 0], {icon: myIcon});
    this.points2.push(marker);
    marker.addTo(this.map2);
  }

  selectAddress(res: OSMPlace | undefined){
    if(res==null || res==undefined){
      return;
    }
    for(let p of this.points){
      this.map.removeLayer(p);
    }
    this.points = [];
    this.selectedAddress = res;
    this.searchBoxAddress = res?.display_name ?? "";
    this.searchAddress.clear();
    console.log(res);
    this.getDateData((res?.lat ?? 0).toString(),(res?.lon ?? 0).toString());
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  map: any;
  map2: any;

  boxZoom: number = 0.5;

  initMap(): void {
    this.map = leaflet.map('map', {
      center: [ 37.76, -122.435 ],
      zoom: 13
    });
    this.map2 = leaflet.map('map2', {
      center: [ 37.76, -122.435 ],
      zoom: 13
    });
    this.map.on('zoomend', (e:any) => {
      let center = this.map.getCenter();
      let newZoom = e.target._zoom;
      this.map2.setView(center,newZoom)
    });
    this.map.on('moveend', (e:any) => {
      let center = this.map.getCenter();
      let newZoom = e.target._zoom;
      this.map2.setView(center,newZoom)
    });

    this.map2.on('zoomend', (e:any) => {
      let center = this.map2.getCenter();
      let newZoom = e.target._zoom;
      this.map.setView(center,newZoom)
    });

    this.map2.on('moveend', (e:any) => {
      let center = this.map2.getCenter();
      let newZoom = e.target._zoom;
      this.map.setView(center,newZoom)
    });

    const tiles = leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      minZoom: 3,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });

    const tiles2 = leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      minZoom: 3,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });

    tiles.addTo(this.map);
    tiles2.addTo(this.map2);
  }

  hslToHex(h: number, s:number, l:number) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n:number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');   // convert to Hex and prefix "0" if needed
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

}

interface DisplayOption{
  value: number;
  display: string;
}

interface OSMPlace{
  place_id: number;
  licence:string;
  osm_type: string;
  osm_id:number;
  lat:number;
  lon:number;
  display_name:string;
  class: string;
  type:number;
  importance:number;
}

interface Box{
  p1: leaflet.LatLngTuple;
  p2: leaflet.LatLngTuple;

  data: Date[][];
  id: number | undefined;
}

interface BoxData{
  startDate: Date;
  numberOfVisits: number;
}

//Test locations
//211 Valencia St - Burma Love (Burmese restaurant)
//99 Grove Street - Civic Center
//1 Telegraph Hill Blvd - Coit Tower
//24 Willie Mays Plaza - Oracle Park
//1 Warriors Way - Chase Center
